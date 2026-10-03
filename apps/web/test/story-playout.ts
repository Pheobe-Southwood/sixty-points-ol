/**
 * 测试用「导演」：把一副牌从头打到结算，每一步都靠引擎判定合法性。
 *
 * 它刻意走**和编排台同一条路**：候选动作 → 试回放 → 合法才落地。
 * 所以这些测试同时在验证两件事：引擎能跑完整一副牌，以及「只允许合法动作进来」这套机制成立。
 * （文件名不带 `.test.ts`，不会被 `node --test "test/*.test.ts"` 当成测试跑。）
 */
import {
  cardClass,
  cardKey,
  cardLevel,
  classOfSet,
  leadInfo,
  sortHand,
  validateFollow,
  validateLead,
  type BidCall,
  type Card,
  type CardClass,
  type GameState,
  type Seat,
  type TrumpModel
} from '@sixty/engine';

import { isScored, replayStory, turnSeat, type ReplayResult } from '../src/lib/story/replay.ts';
import type { StoryAction, StorySpec, StoryStep, StoryStepInput } from '../src/lib/story/types.ts';

/** 默认叫牌：你 40♣ → 阿豪 45♥ → 小美不叫 → 你不叫（与教程同一副牌的叫法） */
export const DEFAULT_BID_PLAN: readonly BidCall[] = [
  { points: 40, strain: 'C' },
  { points: 45, strain: 'H' },
  'pass',
  'pass'
];

const MAX_CANDIDATES = 20000;

function combinations<T>(items: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]): void => {
    if (out.length >= MAX_CANDIDATES) return;
    if (acc.length === n) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      acc.push(items[i]!);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

/** 领出候选：先试同门相邻的两张（让牌局出现多张一墩），再试最小单张 */
function leadCandidates(hand: readonly Card[], trump: TrumpModel): Card[][] {
  const byClass = new Map<CardClass, Card[]>();
  for (const card of hand) {
    const cls = cardClass(card, trump);
    const list = byClass.get(cls) ?? [];
    list.push(card);
    byClass.set(cls, list);
  }
  const runs: Card[][] = [];
  for (const list of byClass.values()) {
    const sorted = [...list].sort((a, b) => cardLevel(a, trump) - cardLevel(b, trump));
    for (let i = 0; i + 1 < sorted.length; i += 1) {
      if (cardLevel(sorted[i + 1]!, trump) === cardLevel(sorted[i]!, trump) + 1) {
        runs.push([sorted[i]!, sorted[i + 1]!]);
        break;
      }
    }
  }
  runs.sort((a, b) => cardLevel(a[0]!, trump) - cardLevel(b[0]!, trump));

  const ascending = [...hand].sort((a, b) => cardLevel(a, trump) - cardLevel(b, trump));
  const single = ascending[0];
  return single === undefined ? runs : [...runs, [single]];
}

function followCandidates(hand: readonly Card[], lead: readonly Card[], trump: TrumpModel, n: number): Card[][] {
  const cls = classOfSet(lead, trump);
  if (cls === null) return [];
  const ascending = (cards: readonly Card[]): Card[] =>
    [...cards].sort((a, b) => cardLevel(a, trump) - cardLevel(b, trump));

  const holding = ascending(hand.filter((card) => cardClass(card, trump) === cls));
  if (holding.length >= n) return combinations(holding, n);
  const others = ascending(hand.filter((card) => cardClass(card, trump) !== cls));
  return combinations(others, n - holding.length).map((extra) => [...holding, ...extra]);
}

/** 按引擎规则挑一手合法出牌；挑不到返回 null（测试会因此失败，而不是悄悄跳过） */
export function pickLegalPlay(state: GameState, seat: Seat): Card[] | null {
  const deal = state.deal;
  if (deal === null || deal.trump === null || deal.trick === null) return null;
  const trump = deal.trump;
  const hand = deal.hands[seat]!;
  const trick = deal.trick;

  if (trick.plays.length === 0) {
    for (const cards of leadCandidates(hand, trump)) {
      if (validateLead(hand, cards, trump) === null) return cards;
    }
    return null;
  }

  const lead = trick.plays[0]!.cards;
  const info = leadInfo(lead, trump);
  if (info === null) return null;
  for (const cards of followCandidates(hand, lead, trump, lead.length)) {
    if (validateFollow(hand, cards, info, trump) === null) return cards;
  }
  return null;
}

export interface PlayoutOptions {
  /** 叫牌计划：用尽后一律不叫 */
  readonly bidPlan?: readonly BidCall[];
  /** 埋底策略：默认埋前 3 张 */
  readonly bury?: (hand: readonly Card[]) => readonly string[];
  readonly maxSteps?: number;
  /** 从已有的一段动作接着打（测「从某一步重打」之后还能走完） */
  readonly start?: readonly StoryStepInput[];
}

export interface PlayoutResult {
  readonly actions: readonly StoryStep[];
  readonly result: ReplayResult;
}

/** 打完一副牌（含叫牌、埋底、每一墩），返回动作序列与最终回放结果 */
export function playOut(spec: StorySpec, options: PlayoutOptions = {}): PlayoutResult {
  const bidPlan = options.bidPlan ?? DEFAULT_BID_PLAN;
  const maxSteps = options.maxSteps ?? 200;
  let actions: StoryStep[] =
    options.start === undefined
      ? [{ type: 'deal', note: null }]
      : options.start.map((step) => ({ ...step, note: step.note ?? null }) as StoryStep);
  let result = replayStory(spec, actions);

  for (let guard = 0; guard < maxSteps; guard += 1) {
    if (result.error !== null || isScored(result.state)) break;
    const state = result.state;
    const deal = state.deal;
    const seat = turnSeat(state);
    if (deal === null || seat === null) break;

    let action: StoryAction | null = null;
    if (deal.phase === 'auction') {
      const bidIndex = actions.filter((step) => step.type === 'bid').length;
      action = { type: 'bid', seat, call: bidPlan[bidIndex] ?? 'pass' };
    } else if (deal.phase === 'bury') {
      const hand = deal.hands[seat]!;
      const keys = options.bury === undefined ? sortHand(hand, deal.trump).slice(0, 3).map(cardKey) : options.bury(hand);
      action = { type: 'bury', seat, cards: [...keys] };
    } else if (deal.phase === 'play') {
      const cards = pickLegalPlay(state, seat);
      if (cards === null) break;
      action = { type: 'play', seat, cards: cards.map(cardKey) };
    }
    if (action === null) break;

    actions = [...actions, { ...action, note: null } as StoryStep];
    result = replayStory(spec, actions);
  }

  return { actions, result };
}

export function testSpec(seed: string, rank = 5): StorySpec {
  return {
    seed,
    dealerSeat: 0,
    levels: [
      { rank, cycle: 0 },
      { rank, cycle: 0 },
      { rank, cycle: 0 }
    ]
  };
}
