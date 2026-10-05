/**
 * 派生事实：把引擎状态翻译成给人看的短句与标签。
 *
 * 分工很明确 —— **牌局事实（谁赢、多少分、什么结构）一律现算**，作者只写「为什么」。
 * 演示页与编排台共用这里，所以网页上不会出现手写的「赢墩 +15 分」这种会过期的数字。
 */
import {
  cardClass,
  cardLevel,
  CARDS_PER_SEAT,
  cardsPoints,
  capturedPoints,
  classOfSet,
  isJoker,
  KITTY_SIZE,
  rankLabel,
  segments,
  SEATS,
  SUIT_LABEL,
  suitDisplayOrder,
  type Card,
  type GameState,
  type Seat,
  type Suit,
  type TrumpModel
} from '@sixty/engine';

import { bidText, cardText } from '../labels.ts';
import type { ReplayResult, ReplayedStep, ReplayedTrick } from './replay.ts';

/**
 * 一手牌的紧凑写法。**一个空格分隔的记号 = 恰好一条顺子**，这是唯一的读法：
 *
 * - 同一门内的连牌合成一个记号：`♣3-4-6`（级牌 5 被跳过后它们是相邻的）；
 * - 不相邻的牌**绝不**用 `-` 连起来，各自成记号：`♣2-3-5 ♣7`、`♠8-9 ♠5`；
 * - 主牌可以跨花色成顺（主花色 → 副级 → 主级 → 王），这时逐张写出：`♠A-♥2`、`♥A-♠5-♥5-小王-大王`；
 * - 三张副级完全相等，永远各成一个记号：`♠5 ♦5 ♣5`。
 *
 * 门内排序用引擎自己的层号：这样 `♥Q-K-A-5` 读起来就是主牌的实际大小顺序 ——
 * 主级 ♥5 排在 ♥A 之后，而不是被当成「5 比 A 小」。
 *
 * **为什么必须这样**：这套演示通篇在讲顺子怎么算（副牌跳过级牌、主牌跨边界、副级不连），
 * 早先的实现把同门牌一律用 `-` 连起来，于是 `[♣10 ♣6]` 被印成「♣6-10」——
 * 看着像顺子，引擎的段分解却是 `[1,1]`。方向正好错在教程最要紧的地方。
 */
export function cardsSummary(cards: readonly Card[], trump: TrumpModel | null): string {
  if (cards.length === 0) return '—';

  // 按「门」分组：有将牌信息时用引擎的 cardClass（主牌是一门，四张级牌与双王都归它），
  // 否则退化成按花色分组（此时也没有跨门成顺的判定可讲）。
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const cls = trump === null ? (isJoker(card) ? 'joker' : card.suit) : cardClass(card, trump);
    const list = groups.get(cls);
    if (list === undefined) groups.set(cls, [card]);
    else list.push(card);
  }

  const level = (card: Card): number => {
    if (trump !== null) return cardLevel(card, trump);
    return isJoker(card) ? (card.joker === 'big' ? 16 : 15) : card.rank;
  };
  // 门的显示序与引擎的 sortHand 同源（副牌黑红交替，主打 ♣ 时 ♥ 与 ♦ 不相邻）；
  // 主牌门（'T' / 无将牌信息时的 'joker'）恒排在最前，不在这个序里
  const suitOrder = suitDisplayOrder(trump);
  const rankOfClass = (cls: string): number =>
    cls === 'T' || cls === 'joker' ? -1 : suitOrder.indexOf(cls as Suit) + 1;

  const tokens: string[] = [];
  for (const cls of [...groups.keys()].sort((a, b) => rankOfClass(a) - rankOfClass(b))) {
    const sorted = [...groups.get(cls)!].sort((a, b) => level(a) - level(b));
    // 切成最大连续段：层号严格 +1 才算相邻（副级三张相等 → 各自成段）
    let run: Card[] = [];
    const flush = (): void => {
      if (run.length > 0) tokens.push(runToken(run));
      run = [];
    };
    for (const card of sorted) {
      if (run.length === 0 || level(card) === level(run[run.length - 1]!) + 1) run.push(card);
      else {
        flush();
        run.push(card);
      }
    }
    flush();
  }
  return tokens.join(' ');
}

/** 一条顺子的写法：同一花色写成 `♣3-4-6`，跨花色（只可能是主牌）逐张写 `♠A-♥2` */
function runToken(run: readonly Card[]): string {
  const suited: { suit: Suit; rank: number }[] = [];
  for (const card of run) {
    if (isJoker(card)) return run.map(cardText).join('-');
    suited.push({ suit: card.suit, rank: card.rank });
  }
  const first = suited[0]!;
  const sameSuit = suited.every((card) => card.suit === first.suit);
  if (!sameSuit) return run.map(cardText).join('-');
  if (suited.length === 1) return `${SUIT_LABEL[first.suit]}${rankLabel(first.rank)}`;
  return `${SUIT_LABEL[first.suit]}${suited.map((card) => rankLabel(card.rank)).join('-')}`;
}

/** 短句里的座位名；座位缺失（如发牌步）时返回空串 */
export function seatName(names: readonly string[], seat: Seat | null): string {
  return seat === null ? '' : (names[seat] ?? `座位 ${seat}`);
}

export interface StepAnnotation {
  readonly headline: string;
  readonly tags: readonly string[];
  /** 这一步涉及的分（出牌/埋底）；叫牌与发牌为 0 */
  readonly points: number;
}

interface PlayContext {
  readonly lead: readonly Card[];
  readonly isLead: boolean;
  readonly winnerSeat: Seat | null;
}

/** 定位一手牌属于哪一墩：先找已完成的墩，再找进行中的那一墩 */
function locatePlay(step: ReplayedStep, result: ReplayResult): PlayContext | null {
  const done = result.tricks.find((trick) => trick.plays.some((play) => play.stepIndex === step.index));
  if (done !== undefined) {
    const lead = done.plays[0]!;
    return { lead: lead.cards, isLead: lead.stepIndex === step.index, winnerSeat: done.winnerSeat };
  }
  const trick = result.states[step.index]?.deal?.trick ?? null;
  if (trick === null || trick.plays.length === 0) return null;
  const lead = trick.plays[0]!;
  return { lead: lead.cards, isLead: lead.seat === step.seat, winnerSeat: null };
}

function playTags(step: ReplayedStep, context: PlayContext | null, trump: TrumpModel): string[] {
  const tags: string[] = [];
  if (context === null) return tags;
  const cls = classOfSet(step.cards, trump);
  const leadCls = classOfSet(context.lead, trump);
  const segs = segments(step.cards, trump);

  if (context.isLead) {
    tags.push(step.cards.length === 1 ? '领出单张' : `领出 ${step.cards.length} 张顺子`);
    if (cls === 'T') tags.push('主牌');
  } else if (cls === 'T' && leadCls !== null && leadCls !== 'T') {
    // 杀牌必须是**一条**连续主牌。只看「主牌压副牌」是不够的：
    // 三张副级完全相等（层号 13/13/13）段分解是 1+1+1，照样杀不了，
    // 而一句「n 张主牌相连」会把这种牌误报成已经赢下了。
    if (segs.length === 1) {
      tags.push(step.cards.length === 1 ? '杀牌（单张主牌）' : `杀牌（${step.cards.length} 张主牌相连）`);
    } else {
      tags.push(`主牌跟牌不成顺（${segs.join('+')}），不能赢`);
    }
  } else if (leadCls !== null && cls !== leadCls) {
    tags.push('垫牌');
  } else {
    tags.push(segs.length === 1 ? `同门跟 ${step.cards.length} 张` : `结构性跟牌（${segs.join('+')}）`);
  }

  if (context.winnerSeat === step.seat) tags.push('赢墩');
  else if (context.winnerSeat !== null) tags.push('此轮不赢');

  const points = cardsPoints(step.cards);
  if (points > 0) tags.push(`带 ${points} 分`);
  return tags;
}

export function annotateStep(
  step: ReplayedStep,
  result: ReplayResult,
  names: readonly string[],
  trump: TrumpModel | null
): StepAnnotation {
  const who = seatName(names, step.seat);
  const points = cardsPoints(step.cards);

  switch (step.kind) {
    case 'deal': {
      const dealerSeat = result.states[step.index]?.deal?.dealerSeat ?? null;
      return {
        headline: `发牌：每家 ${CARDS_PER_SEAT} 张，另留 ${KITTY_SIZE} 张暗底`,
        tags: dealerSeat === null ? [] : [`${seatName(names, dealerSeat)} 发牌`],
        points: 0
      };
    }
    case 'bid': {
      const call = step.step.type === 'bid' ? step.step.call : 'pass';
      return {
        headline: `${who} ${bidText(call)}`,
        tags: step.redeal ? ['三家不叫，本副作废重发'] : [],
        points: 0
      };
    }
    case 'bury':
      return {
        headline: `${who} 埋 ${step.cards.length} 张（底分 ${points}）`,
        tags: ['这 3 张结算前对闲家不可见'],
        points
      };
    case 'play': {
      const context = trump === null ? null : locatePlay(step, result);
      const tags = trump === null || context === null ? [] : playTags(step, context, trump);
      const lead = context?.isLead === true;
      return {
        headline: `${who} ${lead ? '领出' : '跟出'} ${cardsSummary(step.cards, trump)}`,
        tags,
        points
      };
    }
  }
}

export interface TrickAnnotation {
  readonly headline: string;
  readonly tags: readonly string[];
}

export function annotateTrick(
  trick: ReplayedTrick,
  names: readonly string[],
  trump: TrumpModel | null
): TrickAnnotation {
  const size = trick.plays[0]?.cards.length ?? 0;
  const leadCls = trump === null ? null : classOfSet(trick.plays[0]!.cards, trump);
  const tags: string[] = [`每家 ${size} 张`];
  if (trump !== null && leadCls === 'T') tags.push('主牌领出');
  if (trump !== null && trick.plays.some((play) => classOfSet(play.cards, trump) === 'T') && leadCls !== 'T') {
    tags.push('有杀牌');
  }
  if (trick.points > 0) tags.push(`本墩 ${trick.points} 分`);
  return {
    headline: `${seatName(names, trick.leaderSeat)} 领出 · ${seatName(names, trick.winnerSeat)} 赢墩`,
    tags
  };
}

export interface RunningPoints {
  readonly declarerSeat: Seat | null;
  readonly declarer: number;
  readonly defenders: number;
  readonly kitty: number;
}

/** 庄家/闲家已抓到的分（按轮累计；底牌分单列，只走庄家的账） */
export function runningPoints(state: GameState): RunningPoints {
  const deal = state.deal;
  if (deal === null) return { declarerSeat: null, declarer: 0, defenders: 0, kitty: 0 };
  const declarerSeat = deal.contract?.declarerSeat ?? null;
  const declarer = declarerSeat === null ? 0 : capturedPoints(deal, declarerSeat);
  const defenders =
    declarerSeat === null
      ? 0
      : SEATS.filter((seat) => seat !== declarerSeat).reduce<number>(
          (sum, seat) => sum + capturedPoints(deal, seat),
          0
        );
  return { declarerSeat, declarer, defenders, kitty: cardsPoints(deal.kitty) };
}

/** 某一门的门名（主牌 / ♣♦♥♠），用于「这是主牌门」这类说明 */
export function classLabel(card: Card, trump: TrumpModel): string {
  const cls = cardClass(card, trump);
  return cls === 'T' ? '主牌' : (SUIT_LABEL[cls] ?? '');
}
