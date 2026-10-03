/**
 * 编排台的状态机：种子 → 牌局 → 你出手 → 说明 → 导出。
 *
 * 三条设计约束，都是为了「不可能出现对不上的牌」：
 * 1. **回放的输入只有 `spec` 与 `actions`**。说明文字存在平行的 `notes` 里，不是回放的输入 ——
 *    所以敲字时不会重放整副牌，而牌面永远等于动作序列的结果。
 * 2. **每一步都先试回放再落地**：引擎判定不合法就不写进动作序列（界面上的禁用只是第一道提示）。
 * 3. **撤销按整份快照整块回退**，不做「说明与动作按下标对齐」这种一改就错位的逻辑。
 */
import {
  cardKey,
  highestBid,
  KITTY_SIZE,
  sortHand,
  type BidCall,
  type Card,
  type DealPhase,
  type DealSummary,
  type GameState,
  type Seat,
  type TrumpModel
} from '@sixty/engine';

import { bidOptions, checkPlay, type BidOption } from '../labels.ts';
import { truncateActions, tryAppend } from './append.ts';
import { annotateStep, annotateTrick, runningPoints, type StepAnnotation, type TrickAnnotation } from './annotate.ts';
import {
  createDraft,
  defaultStorage,
  newDraftId,
  nowIso,
  readStore,
  removeDraft as removeFromStore,
  writeDraft,
  type StorageLike
} from './draft.ts';
import { buildStory, draftFromStory, parseStoryJson, SLUG_PATTERN, storyToJson } from './export.ts';
import {
  isScored,
  replayStory,
  stateAt,
  tricksThrough,
  trumpOf,
  turnSeat,
  type ReplayResult,
  type ReplayedStep,
  type ReplayedTrick
} from './replay.ts';
import type { DraftSetup, StoryAction, StoryDraft, StorySpec, StoryStep } from './types.ts';

export interface StudioMeta {
  readonly slug: string;
  readonly title: string;
  readonly names: readonly [string, string, string];
  readonly intro: string;
  readonly outro: string;
}

interface Snapshot {
  readonly actions: readonly StoryAction[];
  readonly notes: readonly string[];
  readonly trickNotes: readonly string[];
  readonly spec: StorySpec;
  readonly meta: StudioMeta;
}

/** 步骤表里的一行：回放事实 + 现算的说明标签 + 作者写的说明 */
export interface StudioRow {
  readonly index: number;
  readonly step: ReplayedStep;
  readonly annotation: StepAnnotation;
  readonly trick: ReplayedTrick | null;
  readonly trickNote: string | null;
  readonly note: string;
  readonly groupKey: string;
  readonly groupLabel: string;
  /** 这一步是该分组的最后一步（墩级说明框插在它后面） */
  readonly groupEnd: boolean;
  readonly showTrickBox: boolean;
}

export interface StudioStats {
  readonly steps: number;
  readonly noted: number;
  readonly tricks: number;
  readonly complete: boolean;
  readonly summary: DealSummary | null;
}

const MAX_UNDO = 200;

/** 动作 + 说明 → 导出用的步骤；顺手剥掉响应式代理，避免把代理塞进引擎状态 */
function withNote(action: StoryAction, note: string | null): StoryStep {
  switch (action.type) {
    case 'deal':
      return { type: 'deal', note };
    case 'bid':
      return {
        type: 'bid',
        seat: action.seat,
        call: action.call === 'pass' ? 'pass' : { points: action.call.points, strain: action.call.strain },
        note
      };
    case 'bury':
    case 'play':
      return { type: action.type, seat: action.seat, cards: [...action.cards], note };
  }
}

/** 导出用的步骤 → 纯动作（草稿载入时用），同样剥掉代理 */
function stripNote(step: StoryStep): StoryAction {
  switch (step.type) {
    case 'deal':
      return { type: 'deal' };
    case 'bid':
      return {
        type: 'bid',
        seat: step.seat,
        call: step.call === 'pass' ? 'pass' : { points: step.call.points, strain: step.call.strain }
      };
    case 'bury':
    case 'play':
      return { type: step.type, seat: step.seat, cards: [...step.cards] };
  }
}

export class StudioState {
  drafts = $state<readonly StoryDraft[]>([]);
  draftId = $state<string | null>(null);
  spec = $state<StorySpec>({ seed: '', dealerSeat: 0, levels: [] });
  meta = $state<StudioMeta>({ slug: '', title: '', names: ['你', '阿豪', '小美'], intro: '', outro: '' });
  actions = $state<readonly StoryAction[]>([]);
  notes = $state<readonly string[]>([]);
  trickNotes = $state<readonly string[]>([]);
  /** non-null 时在看历史某一步（只看，不改） */
  previewIndex = $state<number | null>(null);
  selected = $state<readonly string[]>([]);
  notice = $state<string | null>(null);
  storageProblem = $state<string | null>(null);
  storageAvailable = $state(true);
  /** 撤销栈深度：私有数组不是响应式的，单独暴露给按钮的禁用态 */
  undoDepth = $state(0);
  redoDepth = $state(0);
  canUndo = $derived(this.undoDepth > 0);
  canRedo = $derived(this.redoDepth > 0);

  #storage: StorageLike | null;
  #undo: Snapshot[] = [];
  #redo: Snapshot[] = [];
  #cursor: string | null = null;

  constructor(storage: StorageLike | null = defaultStorage()) {
    this.#storage = storage;
    this.storageAvailable = storage !== null;
  }

  /* ---------- 回放与派生 ---------- */

  replay = $derived.by((): ReplayResult | null =>
    this.spec.levels.length === 3 && this.actions.length > 0 ? replayStory(this.spec, this.actions) : null
  );

  state = $derived.by((): GameState | null => {
    const replay = this.replay;
    return replay === null ? null : stateAt(replay, this.previewIndex);
  });

  phase = $derived.by((): DealPhase | null => this.state?.deal?.phase ?? null);
  trump = $derived.by((): TrumpModel | null => {
    const state = this.state;
    return state === null ? null : trumpOf(state);
  });
  turn = $derived.by((): Seat | null => {
    const state = this.state;
    return state === null ? null : turnSeat(state);
  });
  previewing = $derived(this.previewIndex !== null);
  complete = $derived.by(() => {
    const state = this.state;
    return state !== null && isScored(state);
  });

  /** 当前该出手的那一家的手牌（埋底阶段就是庄家的 20 张） */
  hand = $derived.by((): readonly Card[] => {
    const deal = this.state?.deal ?? null;
    const seat = this.turn;
    if (deal === null || seat === null) return [];
    return sortHand(deal.hands[seat] ?? [], deal.trump);
  });

  selectedCards = $derived.by((): readonly Card[] =>
    this.hand.filter((card) => this.selected.includes(cardKey(card)))
  );

  /** 本地预判（与服务端、牌桌同一套 checkPlay）；只看不判的预览状态下不提示 */
  verdict = $derived.by((): string | null => {
    const deal = this.state?.deal ?? null;
    if (deal === null || deal.trump === null || deal.phase !== 'play' || this.previewing) return null;
    const cards = this.selectedCards;
    if (cards.length === 0) return null;
    const lead = deal.trick !== null && deal.trick.plays.length > 0 ? deal.trick.plays[0]!.cards : null;
    return checkPlay({ hand: this.hand, trump: deal.trump, lead }, cards);
  });

  bidRows = $derived.by((): readonly BidOption[] => {
    const deal = this.state?.deal ?? null;
    return deal === null ? [] : bidOptions(highestBid(deal));
  });

  points = $derived.by(() => {
    const state = this.state;
    return state === null ? { declarerSeat: null, declarer: 0, defenders: 0, kitty: 0 } : runningPoints(state);
  });

  tricks = $derived.by((): readonly ReplayedTrick[] => {
    const replay = this.replay;
    return replay === null ? [] : tricksThrough(replay, this.previewIndex);
  });

  rows = $derived.by((): readonly StudioRow[] => {
    const replay = this.replay;
    if (replay === null) return [];
    const out: StudioRow[] = [];
    for (const step of replay.steps) {
      const trick =
        step.trickOrdinal === null ? null : (replay.tricks.find((item) => item.ordinal === step.trickOrdinal) ?? null);
      const next = replay.steps[step.index + 1] ?? null;
      const groupKey = step.trickOrdinal === null ? step.kind : `trick:${step.trickOrdinal}`;
      const groupLabel =
        step.trickOrdinal === null
          ? step.kind === 'deal'
            ? '发牌'
            : step.kind === 'bid'
              ? '叫牌'
              : '埋底'
          : `第 ${step.trickOrdinal + 1} 墩`;
      const nextKey = next === null ? null : next.trickOrdinal === null ? next.kind : `trick:${next.trickOrdinal}`;
      out.push({
        index: step.index,
        step,
        annotation: annotateStep(step, replay, this.meta.names, trumpOf(replay.states[step.index] ?? replay.state)),
        trick,
        trickNote:
          step.trickOrdinal === null ? null : (this.trickNotes[step.trickOrdinal] ?? null),
        note: this.notes[step.index] ?? '',
        groupKey,
        groupLabel,
        groupEnd: nextKey !== groupKey,
        showTrickBox: step.trickOrdinal !== null && nextKey !== groupKey
      });
    }
    return out;
  });

  trickAnnotations = $derived.by((): ReadonlyMap<number, TrickAnnotation> => {
    const map = new Map<number, TrickAnnotation>();
    const trump = this.trump;
    for (const trick of this.tricks) map.set(trick.ordinal, annotateTrick(trick, this.meta.names, trump));
    return map;
  });

  stats = $derived.by((): StudioStats => ({
    steps: this.actions.length,
    noted: this.notes.filter((note) => note.trim().length > 0).length,
    tricks: this.replay?.tricks.length ?? 0,
    complete: this.complete,
    summary: this.state?.deal?.summary ?? null
  }));

  /** 能一眼看出的问题（导出前会再查一遍，这里只是提前提示） */
  problems = $derived.by((): readonly string[] => {
    if (this.draftId === null) return [];
    const list: string[] = [];
    if (!SLUG_PATTERN.test(this.meta.slug)) list.push('slug 不合法：只允许小写字母 / 数字 / 连字符');
    if (this.meta.title.trim().length === 0) list.push('还没写标题');
    const error = this.replay?.error ?? null;
    if (error !== null) list.push(`第 ${error.index + 1} 步不合法：${error.message}`);
    if (!this.complete) list.push('这副牌还没打完，导出的 JSON 只能当草稿备份');
    return list;
  });

  /* ---------- 草稿读写 ---------- */

  load(): void {
    const { store, problem } = readStore(this.#storage);
    this.drafts = store.drafts;
    this.storageProblem = problem;
    const newest = store.drafts[0];
    if (newest !== undefined) this.openDraft(newest, false);
  }

  openDraft(draft: StoryDraft, persist = true): void {
    this.draftId = draft.id;
    this.spec = {
      seed: draft.spec.seed,
      dealerSeat: draft.spec.dealerSeat,
      levels: draft.spec.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
    };
    this.meta = {
      slug: draft.slug,
      title: draft.title,
      names: [...draft.names] as [string, string, string],
      intro: draft.intro,
      outro: draft.outro
    };
    this.actions = draft.actions.map(stripNote);
    this.notes = draft.actions.map((step) => step.note ?? '');
    this.trickNotes = [...draft.trickNotes.map((note) => note ?? '')];
    this.previewIndex = null;
    this.selected = [];
    this.notice = null;
    this.#undo = [];
    this.#redo = [];
    this.#cursor = null;
    this.undoDepth = 0;
    this.redoDepth = 0;
    if (persist) this.persist();
  }

  start(setup: DraftSetup): void {
    const draft = createDraft(setup, newDraftId(), nowIso());
    this.openDraft(draft);
    this.notice = '已发牌。三家都由你出：叫牌 → 埋底 → 每一墩，旁边随手写说明。';
  }

  newDraft(): void {
    this.draftId = null;
    this.actions = [];
    this.notes = [];
    this.trickNotes = [];
    this.previewIndex = null;
    this.selected = [];
    this.notice = null;
    this.#undo = [];
    this.#redo = [];
    this.#cursor = null;
    this.undoDepth = 0;
    this.redoDepth = 0;
  }

  deleteDraft(id: string): void {
    const result = removeFromStore(this.#storage, id);
    this.drafts = result.store.drafts;
    this.storageProblem = result.problem;
    if (this.draftId === id) this.newDraft();
  }

  toDraft(): StoryDraft | null {
    if (this.draftId === null) return null;
    return {
      id: this.draftId,
      slug: this.meta.slug,
      title: this.meta.title,
      names: [...this.meta.names] as [string, string, string],
      spec: {
        seed: this.spec.seed,
        dealerSeat: this.spec.dealerSeat,
        levels: this.spec.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
      },
      actions: this.actions.map((action, index) => withNote(action, this.noteOrNull(index))),
      trickNotes: this.trickNotes.map((note) => (note.trim().length > 0 ? note : null)),
      intro: this.meta.intro,
      outro: this.meta.outro,
      updatedAt: nowIso()
    };
  }

  persist(): void {
    const draft = this.toDraft();
    if (draft === null) return;
    if (this.#storage === null) {
      this.storageAvailable = false;
      this.storageProblem = '本机无法保存（浏览器禁用了本地存储），草稿只在这次会话里有效，请随时导出 JSON';
      return;
    }
    const result = writeDraft(this.#storage, draft);
    this.drafts = result.store.drafts;
    this.storageProblem = result.problem;
  }

  /* ---------- 出手 ---------- */

  push(action: StoryAction): boolean {
    if (this.previewing) {
      this.notice = '正在回看历史，先回到最新再改。';
      return false;
    }
    const check = tryAppend(this.spec, this.actions, action);
    if (!check.ok) {
      this.notice = check.message;
      return false;
    }
    this.snapshot();
    this.actions = check.steps;
    this.notes = [...this.notes, ''];
    this.selected = [];
    this.notice = null;
    this.#cursor = null;
    this.persist();
    return true;
  }

  bid(call: BidCall): boolean {
    const seat = this.turn;
    if (seat === null) return false;
    return this.push({ type: 'bid', seat, call });
  }

  bury(): boolean {
    const seat = this.turn;
    if (seat === null || this.selectedCards.length !== KITTY_SIZE) return false;
    return this.push({ type: 'bury', seat, cards: this.selectedCards.map(cardKey) });
  }

  play(): boolean {
    const seat = this.turn;
    if (seat === null || this.selectedCards.length === 0 || this.verdict !== null) return false;
    return this.push({ type: 'play', seat, cards: this.selectedCards.map(cardKey) });
  }

  toggle(key: string): void {
    this.selected = this.selected.includes(key)
      ? this.selected.filter((item) => item !== key)
      : [...this.selected, key];
  }

  clearSelection(): void {
    this.selected = [];
  }

  /* ---------- 撤销 / 重做 / 重打 ---------- */

  private snapshot(): void {
    this.#undo.push({
      actions: [...this.actions],
      notes: [...this.notes],
      trickNotes: [...this.trickNotes],
      spec: {
        seed: this.spec.seed,
        dealerSeat: this.spec.dealerSeat,
        levels: this.spec.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
      },
      meta: { ...this.meta, names: [...this.meta.names] as [string, string, string] }
    });
    if (this.#undo.length > MAX_UNDO) this.#undo.shift();
    this.#redo = [];
    this.undoDepth = this.#undo.length;
    this.redoDepth = 0;
  }

  private restore(snapshot: Snapshot): void {
    this.actions = snapshot.actions;
    this.notes = snapshot.notes;
    this.trickNotes = snapshot.trickNotes;
    this.spec = snapshot.spec;
    this.meta = snapshot.meta;
    this.previewIndex = null;
    this.selected = [];
    this.#cursor = null;
    this.persist();
  }

  undo(): void {
    const last = this.#undo.pop();
    if (last === undefined) return;
    this.#redo.push(this.currentSnapshot());
    this.undoDepth = this.#undo.length;
    this.redoDepth = this.#redo.length;
    this.restore(last);
    this.notice = '已撤销一步。';
  }

  redo(): void {
    const next = this.#redo.pop();
    if (next === undefined) return;
    this.#undo.push(this.currentSnapshot());
    this.undoDepth = this.#undo.length;
    this.redoDepth = this.#redo.length;
    this.restore(next);
    this.notice = '已重做。';
  }

  private currentSnapshot(): Snapshot {
    return {
      actions: [...this.actions],
      notes: [...this.notes],
      trickNotes: [...this.trickNotes],
      spec: {
        seed: this.spec.seed,
        dealerSeat: this.spec.dealerSeat,
        levels: this.spec.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
      },
      meta: { ...this.meta, names: [...this.meta.names] as [string, string, string] }
    };
  }

  /** 「从这一步重打」：丢掉这一步及其之后 */
  truncateAt(index: number): void {
    if (index <= 0 || index >= this.actions.length) return;
    this.snapshot();
    const cut = truncateActions(this.spec, this.actions, index);
    this.actions = cut.steps;
    this.notes = this.notes.slice(0, index);
    this.trickNotes = this.trickNotes.slice(0, cut.trickCount);
    this.previewIndex = null;
    this.selected = [];
    this.notice = `已回到第 ${index} 步之前，可以重打。`;
    this.persist();
  }

  /** 换种子重开：只保留设置，动作与说明清空 */
  restart(spec: StorySpec): void {
    this.snapshot();
    this.spec = spec;
    this.actions = [{ type: 'deal' }];
    this.notes = [''];
    this.trickNotes = [];
    this.previewIndex = null;
    this.selected = [];
    this.notice = '已按新种子重新发牌。';
    this.persist();
  }

  /* ---------- 说明 ---------- */

  private noteOrNull(index: number): string | null {
    const note = this.notes[index];
    return note !== undefined && note.trim().length > 0 ? note : null;
  }

  private coalesce(key: string): void {
    if (this.#cursor !== key) {
      this.snapshot();
      this.#cursor = key;
    }
  }

  /** 一次编辑同一个框只压一次快照：撤销是「撤回这一框的整段编辑」 */
  setNote(index: number, text: string): void {
    this.coalesce(`step:${index}`);
    const notes = [...this.notes];
    notes[index] = text;
    this.notes = notes;
    this.persist();
  }

  setTrickNote(ordinal: number, text: string): void {
    this.coalesce(`trick:${ordinal}`);
    const list = [...this.trickNotes];
    while (list.length <= ordinal) list.push('');
    list[ordinal] = text;
    this.trickNotes = list;
    this.persist();
  }

  setMeta(field: 'slug' | 'title' | 'intro' | 'outro', value: string): void {
    this.coalesce(`meta:${field}`);
    this.meta = { ...this.meta, [field]: value };
    this.persist();
  }

  setNames(names: readonly [string, string, string]): void {
    this.meta = { ...this.meta, names };
    this.persist();
  }

  endEdit(): void {
    this.#cursor = null;
  }

  /* ---------- 导出 / 导入 ---------- */

  exportJson(): { readonly json: string; readonly errors: readonly string[] } {
    const draft = this.toDraft();
    if (draft === null) return { json: '', errors: ['还没有草稿'] };
    const { story, errors } = buildStory(draft);
    if (story === null) return { json: '', errors };
    return { json: storyToJson(story), errors: [] };
  }

  importJson(text: string): boolean {
    const parsed = parseStoryJson(text);
    if (!parsed.ok) {
      this.notice = `导入失败：${parsed.errors.join('；')}`;
      return false;
    }
    this.openDraft(draftFromStory(parsed.story, newDraftId(), nowIso()));
    this.notice = `已导入「${parsed.story.title}」。`;
    return true;
  }
}
