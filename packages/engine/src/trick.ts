import type { Card, Seat } from './cards.ts';
import { classOfSet, segments, topLevel, type TrumpModel } from './order.ts';

export interface TrickPlay {
  readonly seat: Seat;
  readonly cards: readonly Card[];
}

/**
 * 一轮赢家：只有“与领出同长度的单段顺子”能竞争。
 * 主牌顺子压过副牌；同门比顶张；层号相等（副级/无主级牌）时先出为大。
 * 旁门垫牌、结构性跟牌（如 3+1）均不能赢。
 */
export function trickWinner(plays: readonly TrickPlay[], t: TrumpModel): Seat {
  const lead = plays[0]!;
  const n = lead.cards.length;
  const leadCls = classOfSet(lead.cards, t)!;
  let bestSeat = lead.seat;
  let bestCards = lead.cards;
  let bestCls: ReturnType<typeof classOfSet> = leadCls;

  for (let i = 1; i < plays.length; i++) {
    const p = plays[i]!;
    if (p.cards.length !== n) continue;
    const cls = classOfSet(p.cards, t);
    if (cls === null) continue;
    if (segments(p.cards, t).length !== 1) continue;

    if (cls === 'T' && bestCls !== 'T') {
      bestSeat = p.seat;
      bestCards = p.cards;
      bestCls = cls;
      continue;
    }
    if (cls !== 'T' && bestCls === 'T') continue;
    if (cls !== 'T' && cls !== leadCls) continue;

    if (topLevel(p.cards, t) > topLevel(bestCards, t)) {
      bestSeat = p.seat;
      bestCards = p.cards;
    }
  }
  return bestSeat;
}
