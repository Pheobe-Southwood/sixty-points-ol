/**
 * 回放：动作序列 → 牌局状态 + 逐步元信息。
 *
 * **这是唯一的口径**：编排台的实时牌桌、撤销/预览、导出前的自检、转换脚本与测试，
 * 全都走这里。页面层永远不自己维护牌局状态，也就不可能出现「显示的和回放的不是同一副牌」。
 *
 * 另一条硬规矩：引擎状态只由 `dispatch` 产生，`Action` 一律**新建普通对象**再递进去。
 * 原因不是洁癖 —— 编排台的草稿是 Svelte 5 的响应式代理，若把代理里的子对象直接塞进
 * `state.deal.auction`，下一次 `dispatch` 的 `structuredClone(prev)` 会抛 DataCloneError。
 */
import {
  auctionTurn,
  cardKey,
  createGame,
  dispatch,
  fullDeck,
  levelLabel,
  playTurn,
  type Action,
  type Card,
  type EngineEvent,
  type GameState,
  type Level,
  type Seat,
  type TrumpModel
} from '@sixty/engine';
import { storyRng } from './rng.ts';
import type { StoryAction, StorySpec, StoryStepInput } from './types.ts';

/** 键 → 牌：全仓库唯一一份映射，写错键必须立刻失败，而不是悄悄出一张不存在的牌 */
const DECK_BY_KEY: ReadonlyMap<string, Card> = new Map(fullDeck().map((card) => [cardKey(card), card]));

export function isCardKey(key: string): boolean {
  return DECK_BY_KEY.has(key);
}

export function cardOf(key: string): Card | null {
  return DECK_BY_KEY.get(key) ?? null;
}

/** 一手牌的牌键（展示与存证用） */
export function keysOf(cards: readonly Card[]): string[] {
  return cards.map(cardKey);
}

/**
 * 牌键 → 牌。生成物里的牌面一律存成牌键（可 diff、可手查），渲染时用它还原。
 *
 * 键写错就抛错：生成物是脚本产出的，出现不存在的键说明生成物被手改了，必须立刻失败。
 */
export function handFromKeys(keys: readonly string[]): Card[] {
  return keys.map((key) => {
    const card = DECK_BY_KEY.get(key);
    if (card === undefined) throw new Error(`牌键不存在：${key}`);
    return card;
  });
}

export interface ReplayedPlay {
  readonly seat: Seat;
  readonly cards: readonly Card[];
  /** 这一手牌对应的动作下标（预览某一步时要靠它定位） */
  readonly stepIndex: number;
}

export interface ReplayedTrick {
  readonly ordinal: number;
  readonly leaderSeat: Seat;
  readonly plays: readonly ReplayedPlay[];
  readonly winnerSeat: Seat;
  readonly points: number;
}

export type StepKind = StoryAction['type'];

export interface ReplayedStep {
  readonly index: number;
  readonly step: StoryStepInput;
  readonly kind: StepKind;
  readonly seat: Seat | null;
  /** 这一步实际出的牌（叫牌/发牌为空） */
  readonly cards: readonly Card[];
  /** 属于第几墩（0 起）；叫牌与埋底为 null */
  readonly trickOrdinal: number | null;
  /** 这一步触发三家不叫重发 */
  readonly redeal: boolean;
  /** 这一步之后本副结算 */
  readonly scored: boolean;
}

export interface ReplayError {
  readonly index: number;
  readonly message: string;
}

export interface ReplayResult {
  /** 发牌前（级别已就位）的初始状态 */
  readonly initial: GameState;
  /** 最后一张发出去的牌局（含重发后的那一副）；「发牌时各家 17 张 + 3 张暗底」的存证取自它 */
  readonly dealtState: GameState | null;
  /** 全部动作之后的状态；出错时停在最后一个合法动作之后 */
  readonly state: GameState;
  /** `states[i]` = 应用 `actions[i]` 之后的状态（预览历史用，不必重放） */
  readonly states: readonly GameState[];
  readonly steps: readonly ReplayedStep[];
  readonly tricks: readonly ReplayedTrick[];
  readonly error: ReplayError | null;
}

/** 引擎的 Action 还包含 newGame 等与编排无关的动作，这里只放行这四种 */
type EngineAction = Extract<Action, { type: 'deal' | 'bid' | 'bury' | 'play' }>;

type Converted =
  | { readonly ok: true; readonly action: EngineAction; readonly cards: readonly Card[] }
  | { readonly ok: false; readonly message: string };

function toEngineAction(step: StoryStepInput): Converted {
  switch (step.type) {
    case 'deal':
      return { ok: true, action: { type: 'deal' }, cards: [] };
    case 'bid':
      return {
        ok: true,
        action: {
          type: 'bid',
          seat: step.seat,
          call: step.call === 'pass' ? 'pass' : { points: step.call.points, strain: step.call.strain }
        },
        cards: []
      };
    case 'bury':
    case 'play': {
      const cards: Card[] = [];
      for (const key of step.cards) {
        const card = DECK_BY_KEY.get(key);
        if (card === undefined) return { ok: false, message: `牌键不存在：${key}` };
        cards.push(card);
      }
      return { ok: true, action: { type: step.type, seat: step.seat, cards: [...cards] }, cards };
    }
  }
}

/** 初始状态：级别取自 `spec`（级牌点数由庄家的级别决定），其余与线上开局一致 */
export function initialState(spec: StorySpec): GameState {
  const state = createGame(spec.dealerSeat);
  state.levels = spec.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }));
  state.dealerSeat = spec.dealerSeat;
  return state;
}

export function replayStory(spec: StorySpec, actions: readonly StoryStepInput[]): ReplayResult {
  const initial = initialState(spec);
  const rng = storyRng(spec.seed);

  let state = initial;
  let dealtState: GameState | null = null;
  const states: GameState[] = [];
  const steps: ReplayedStep[] = [];
  const tricks: ReplayedTrick[] = [];
  let pending: ReplayedPlay[] = [];
  let error: ReplayError | null = null;

  for (let index = 0; index < actions.length; index += 1) {
    const step = actions[index]!;
    const converted = toEngineAction(step);
    if (!converted.ok) {
      error = { index, message: converted.message };
      break;
    }

    const result = dispatch(state, converted.action, rng);
    if (!result.ok) {
      error = { index, message: result.message };
      break;
    }
    state = result.state;

    let won: Extract<EngineEvent, { type: 'trickWon' }> | null = null;
    let redeal = false;
    let scored = false;
    let dealt = false;
    for (const event of result.events) {
      if (event.type === 'trickWon') won = event;
      if (event.type === 'redeal') redeal = true;
      if (event.type === 'dealt') dealt = true;
      if (event.type === 'dealScored') scored = true;
    }
    if (dealt || redeal) dealtState = state;

    const deal = state.deal;
    if (converted.action.type === 'play') {
      pending.push({ seat: converted.action.seat, cards: converted.cards, stepIndex: index });
    }

    const trickOrdinal =
      deal === null || converted.action.type !== 'play'
        ? null
        : won === null
          ? deal.trickHistory.length
          : deal.trickHistory.length - 1;

    if (won !== null) {
      tricks.push({
        ordinal: tricks.length,
        leaderSeat: won.leaderSeat,
        plays: pending,
        winnerSeat: won.winnerSeat,
        points: won.points
      });
      pending = [];
    }

    steps.push({
      index,
      step,
      kind: converted.action.type,
      seat: 'seat' in converted.action ? converted.action.seat : null,
      cards: converted.cards,
      trickOrdinal,
      redeal,
      scored
    });
    states.push(state);
  }

  return { initial, dealtState, state, states, steps, tricks, error };
}

/** 展示用的状态：`previewIndex === null` 表示看最新 */
export function stateAt(result: ReplayResult, previewIndex: number | null): GameState {
  if (previewIndex === null) return result.state;
  return result.states[previewIndex] ?? result.state;
}

/** 只看「已经打完的墩」到某一步为止 */
export function tricksThrough(result: ReplayResult, previewIndex: number | null): readonly ReplayedTrick[] {
  if (previewIndex === null) return result.tricks;
  return result.tricks.filter((trick) =>
    trick.plays.every((play) => play.stepIndex <= previewIndex)
  );
}

/** 当前该谁动：叫牌轮到的座位 / 庄家埋底 / 打牌轮到的座位；结算后为 null */
export function turnSeat(state: GameState): Seat | null {
  const deal = state.deal;
  if (deal === null) return null;
  if (deal.phase === 'auction') return auctionTurn(deal);
  if (deal.phase === 'bury') return deal.contract === null ? null : deal.contract.declarerSeat;
  if (deal.phase === 'play') return playTurn(deal);
  return null;
}

export function trumpOf(state: GameState): TrumpModel | null {
  return state.deal?.trump ?? null;
}

/** 这副牌是否已经打完 */
export function isScored(state: GameState): boolean {
  return state.deal?.phase === 'scored';
}

export function levelKey(level: Level): string {
  return levelLabel(level);
}
