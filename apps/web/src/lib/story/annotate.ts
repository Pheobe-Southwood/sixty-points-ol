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
  type Card,
  type GameState,
  type Seat,
  type Suit,
  type TrumpModel
} from '@sixty/engine';

import { callText, cardText } from '../labels.ts';
import type { ReplayResult, ReplayedStep, ReplayedTrick } from './replay.ts';

/**
 * 一手牌的紧凑写法：同一门的牌合成一段（`♥3-4-6`），跨门用空格分开（`♣2 ♣3 ♦4`）。
 *
 * 门内排序用引擎自己的层号（有将牌信息时）：这样 `♥Q-K-A-5` 读起来就是主牌的实际大小顺序 ——
 * 主级 ♥5 排在 ♥A 之后，而不是被当成「5 比 A 小」。
 */
export function cardsSummary(cards: readonly Card[], trump: TrumpModel | null): string {
  if (cards.length === 0) return '—';
  const jokers: Card[] = [];
  const bySuit = new Map<Suit, Card[]>();
  for (const card of cards) {
    if (isJoker(card)) {
      jokers.push(card);
      continue;
    }
    const list = bySuit.get(card.suit) ?? [];
    list.push(card);
    bySuit.set(card.suit, list);
  }
  const order = (a: Card, b: Card): number =>
    trump === null ? (isJoker(a) ? 0 : a.rank) - (isJoker(b) ? 0 : b.rank) : cardLevel(a, trump) - cardLevel(b, trump);
  const parts: string[] = [];
  for (const [suit, list] of bySuit) {
    const ranks = [...list].sort(order).map((card) => (isJoker(card) ? '?' : rankLabel(card.rank)));
    parts.push(ranks.length === 1 ? `${SUIT_LABEL[suit]}${ranks[0]}` : `${SUIT_LABEL[suit]}${ranks.join('-')}`);
  }
  return [...jokers.map(cardText), ...parts].join(' ');
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

  if (context.isLead) {
    tags.push(step.cards.length === 1 ? '领出单张' : `领出 ${step.cards.length} 张顺子`);
    if (cls === 'T') tags.push('主牌');
  } else if (cls === 'T' && leadCls !== null && leadCls !== 'T') {
    tags.push(`杀牌（${step.cards.length} 张主牌相连）`);
  } else if (leadCls !== null && cls !== leadCls) {
    tags.push('垫牌');
  } else {
    const segs = segments(step.cards, trump);
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
        headline: `${who} ${callText(call)}`,
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
