/**
 * 导出 / 导入：草稿 ↔ `DealStory`（JSON）。
 *
 * 导出做两件事，缺一不可：
 * 1. **回放一次**（`replayStory`）—— 有一步不合法就不给导出，并说清是第几步；
 * 2. **冗余写下一副牌面**（手牌 / 原底 / 埋底 / 将牌 / 结算），
 *    下游渲染只读这份存证，不必（也不该）靠种子重算。
 *
 * 导入是纯结构校验：形状不对就逐条报错，不做「猜你想干什么」的容错。
 * 语义（这一步能不能出）交给回放，不在这里重复实现。
 */
import {
  BID_STEP,
  cardKey,
  MIN_BID,
  STRAINS,
  type BidCall,
  type Level,
  type Seat,
  type Strain
} from '@sixty/engine';

import { isCardKey, replayStory } from './replay.ts';
import { STORY_VERSION, type DealStory, type StoryDraft, type StorySpec, type StoryStep } from './types.ts';

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isLevel(value: unknown): value is Level {
  if (!isRecord(value)) return false;
  const rank = value['rank'];
  const cycle = value['cycle'];
  return (
    typeof rank === 'number' &&
    Number.isInteger(rank) &&
    rank >= 2 &&
    rank <= 14 &&
    typeof cycle === 'number' &&
    Number.isInteger(cycle) &&
    cycle >= 0
  );
}

export function isSeat(value: unknown): value is Seat {
  return value === 0 || value === 1 || value === 2;
}

function isStrain(value: unknown): value is Strain {
  return typeof value === 'string' && (STRAINS as readonly string[]).includes(value);
}

function isCall(value: unknown): value is BidCall {
  if (value === 'pass') return true;
  if (!isRecord(value)) return false;
  const points = value['points'];
  const strain = value['strain'];
  return (
    typeof points === 'number' &&
    Number.isInteger(points) &&
    points >= MIN_BID &&
    points % BID_STEP === 0 &&
    isStrain(strain)
  );
}

function isKeyList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && isCardKey(item));
}

export function isNames(value: unknown): value is [string, string, string] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0)
  );
}

export function isStorySpec(value: unknown): value is StorySpec {
  if (!isRecord(value)) return false;
  const seed = value['seed'];
  const levels = value['levels'];
  return (
    typeof seed === 'string' &&
    seed.trim().length > 0 &&
    isSeat(value['dealerSeat']) &&
    Array.isArray(levels) &&
    levels.length === 3 &&
    levels.every(isLevel)
  );
}

export function isStoryStep(value: unknown): value is StoryStep {
  if (!isRecord(value)) return false;
  const note = value['note'];
  if (!(note === null || typeof note === 'string')) return false;
  switch (value['type']) {
    case 'deal':
      return true;
    case 'bid':
      return isSeat(value['seat']) && isCall(value['call']);
    case 'bury':
    case 'play':
      return isSeat(value['seat']) && isKeyList(value['cards']);
    default:
      return false;
  }
}

function isTrickNotes(value: unknown): value is readonly (string | null)[] {
  return Array.isArray(value) && value.every((item) => item === null || typeof item === 'string');
}

function isTrump(value: unknown): boolean {
  if (value === null) return true;
  return isRecord(value) && isStrain(value['strain']) && typeof value['rank'] === 'number';
}

function isContract(value: unknown): boolean {
  if (value === null) return true;
  return isRecord(value) && typeof value['points'] === 'number' && isStrain(value['strain']) && isSeat(value['declarerSeat']);
}

function isSnapshot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const hands = value['hands'];
  return (
    Array.isArray(hands) &&
    hands.length === 3 &&
    hands.every(isKeyList) &&
    isKeyList(value['originalKitty']) &&
    isKeyList(value['kitty']) &&
    isTrump(value['trump']) &&
    isContract(value['contract']) &&
    (value['summary'] === null || isRecord(value['summary']))
  );
}

/** 草稿的结构校验（从本机存储读回来时用；形状不对就整份丢掉，不做修补） */
export function parseDraft(value: unknown): StoryDraft | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const slug = value['slug'];
  const title = value['title'];
  const intro = value['intro'];
  const outro = value['outro'];
  const updatedAt = value['updatedAt'];
  const actions = value['actions'];
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) return null;
  if (typeof title !== 'string') return null;
  if (!isNames(value['names'])) return null;
  if (!isStorySpec(value['spec'])) return null;
  if (!Array.isArray(actions) || !actions.every(isStoryStep)) return null;
  if (!isTrickNotes(value['trickNotes'])) return null;
  if (typeof intro !== 'string' || typeof outro !== 'string') return null;
  if (typeof updatedAt !== 'string') return null;
  return {
    id,
    slug,
    title,
    names: value['names'],
    spec: {
      seed: (value['spec'] as StorySpec).seed,
      dealerSeat: (value['spec'] as StorySpec).dealerSeat,
      levels: (value['spec'] as StorySpec).levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
    },
    actions: (actions as StoryStep[]).map((step) => ({ ...step })),
    trickNotes: [...(value['trickNotes'] as (string | null)[])],
    intro,
    outro,
    updatedAt
  };
}

export interface BuildResult {
  readonly story: DealStory | null;
  readonly errors: readonly string[];
}

/** 草稿 → 可导出的故事；任何一步不合法都不给导出 */
export function buildStory(draft: StoryDraft): BuildResult {
  const errors: string[] = [];
  if (!SLUG_PATTERN.test(draft.slug)) {
    errors.push('slug 必须是 1-64 位小写字母 / 数字 / 连字符，且以字母或数字开头');
  }
  if (draft.title.trim().length === 0) errors.push('标题不能为空');
  if (draft.spec.seed.trim().length === 0) errors.push('种子不能为空');
  if (draft.spec.levels.length !== 3) errors.push('三家级别各要有一个');

  const replay = replayStory(draft.spec, draft.actions);
  if (replay.error !== null) {
    errors.push(`第 ${replay.error.index + 1} 步不合法：${replay.error.message}`);
  }
  if (errors.length > 0) return { story: null, errors };

  const finalDeal = replay.state.deal;
  if (finalDeal === null) return { story: null, errors: ['还没有发牌，没有牌面可导出'] };
  // 手牌与暗底取「刚发完牌」那一刻（打完之后手牌是空的）；
  // 底牌 / 将牌 / 定约 / 结算取最终状态。
  const dealt = replay.dealtState?.deal ?? finalDeal;

  const story: DealStory = {
    version: STORY_VERSION,
    slug: draft.slug,
    title: draft.title,
    names: [...draft.names] as [string, string, string],
    spec: {
      seed: draft.spec.seed,
      dealerSeat: draft.spec.dealerSeat,
      levels: draft.spec.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
    },
    deal: {
      hands: dealt.hands.map((hand) => hand.map(cardKey)),
      originalKitty: dealt.originalKitty.map(cardKey),
      kitty: finalDeal.kitty.map(cardKey),
      trump: finalDeal.trump === null ? null : { strain: finalDeal.trump.strain, rank: finalDeal.trump.rank },
      contract:
        finalDeal.contract === null
          ? null
          : {
              points: finalDeal.contract.points,
              strain: finalDeal.contract.strain,
              declarerSeat: finalDeal.contract.declarerSeat
            },
      summary: finalDeal.summary
    },
    actions: draft.actions.map((step) => ({ ...step })),
    trickNotes: [...draft.trickNotes],
    intro: draft.intro,
    outro: draft.outro,
    complete: finalDeal.phase === 'scored',
    exportedAt: new Date().toISOString()
  };
  return { story, errors: [] };
}

export function storyToJson(story: DealStory): string {
  return `${JSON.stringify(story, null, 2)}\n`;
}

export function storyFilename(story: DealStory): string {
  return `${story.slug}.json`;
}

export type ParseResult = { readonly ok: true; readonly story: DealStory } | { readonly ok: false; readonly errors: readonly string[] };

export function parseStoryJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return { ok: false, errors: [`不是合法 JSON：${cause instanceof Error ? cause.message : String(cause)}`] };
  }
  if (!isRecord(raw)) return { ok: false, errors: ['顶层必须是一个对象'] };

  const errors: string[] = [];
  if (raw['version'] !== STORY_VERSION) {
    errors.push(`version 必须是 ${STORY_VERSION}（读到 ${String(raw['version'])}）`);
  }
  const slug = raw['slug'];
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    errors.push('slug 必须是 1-64 位小写字母 / 数字 / 连字符，且以字母或数字开头');
  }
  if (typeof raw['title'] !== 'string' || raw['title'].trim().length === 0) errors.push('title 不能为空');
  if (!isNames(raw['names'])) errors.push('names 必须是三个非空字符串');
  if (!isStorySpec(raw['spec'])) errors.push('spec 需要 { seed, dealerSeat, levels }（levels 三项、rank 2-14、cycle ≥ 0）');
  if (!isSnapshot(raw['deal'])) {
    errors.push('deal 需要 { hands（3 组牌键）, originalKitty, kitty, trump, contract, summary }');
  }
  if (!Array.isArray(raw['actions']) || !raw['actions'].every(isStoryStep)) {
    errors.push('actions 必须是动作数组（deal / bid / bury / play，每条都带 note）');
  }
  if (!isTrickNotes(raw['trickNotes'])) errors.push('trickNotes 必须是（字符串 | null）数组');
  if (typeof raw['intro'] !== 'string') errors.push('intro 必须是字符串（可为空）');
  if (typeof raw['outro'] !== 'string') errors.push('outro 必须是字符串（可为空）');
  if (typeof raw['complete'] !== 'boolean') errors.push('complete 必须是布尔值');
  if (typeof raw['exportedAt'] !== 'string') errors.push('exportedAt 必须是字符串');

  if (errors.length > 0) return { ok: false, errors };

  const spec = raw['spec'] as StorySpec;
  const deal = raw['deal'] as DealStory['deal'];
  const story: DealStory = {
    version: STORY_VERSION,
    slug: slug as string,
    title: raw['title'] as string,
    names: [...(raw['names'] as [string, string, string])] as [string, string, string],
    spec: {
      seed: spec.seed,
      dealerSeat: spec.dealerSeat,
      levels: spec.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
    },
    deal: {
      hands: deal.hands.map((hand) => [...hand]),
      originalKitty: [...deal.originalKitty],
      kitty: [...deal.kitty],
      trump: deal.trump === null ? null : { strain: deal.trump.strain, rank: deal.trump.rank },
      contract:
        deal.contract === null
          ? null
          : {
              points: deal.contract.points,
              strain: deal.contract.strain,
              declarerSeat: deal.contract.declarerSeat
            },
      summary: deal.summary
    },
    actions: (raw['actions'] as StoryStep[]).map((step) => ({ ...step })),
    trickNotes: [...(raw['trickNotes'] as (string | null)[])],
    intro: raw['intro'] as string,
    outro: raw['outro'] as string,
    complete: raw['complete'] as boolean,
    exportedAt: raw['exportedAt'] as string
  };
  return { ok: true, story };
}

/** 导出的 JSON → 草稿（继续在编排台里改，或在别的浏览器里接手） */
export function draftFromStory(story: DealStory, id: string, now: string): StoryDraft {
  return {
    id,
    slug: story.slug,
    title: story.title,
    names: [...story.names] as [string, string, string],
    spec: {
      seed: story.spec.seed,
      dealerSeat: story.spec.dealerSeat,
      levels: story.spec.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
    },
    actions: story.actions.map((step) => ({ ...step })),
    trickNotes: [...story.trickNotes],
    intro: story.intro,
    outro: story.outro,
    updatedAt: now
  };
}
