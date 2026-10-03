import { STRAIN_LABEL, type Strain } from './cards.ts';

export interface Bid {
  readonly points: number;
  readonly strain: Strain;
}
export type BidCall = Bid | 'pass';

export const MIN_BID = 40;
export const BID_STEP = 5;

/** 花色序：C < D < H < S < NT，仅用于叫牌 */
export const STRAIN_RANK: Record<Strain, number> = { C: 0, D: 1, H: 2, S: 3, NT: 4 };

export function isPass(call: BidCall): call is 'pass' {
  return call === 'pass';
}

export function isHigherBid(a: Bid, b: Bid | null): boolean {
  if (b === null) return true;
  if (a.points !== b.points) return a.points > b.points;
  return STRAIN_RANK[a.strain] > STRAIN_RANK[b.strain];
}

export function validateCall(call: BidCall, highest: Bid | null): string | null {
  if (isPass(call)) return null;
  if (!Number.isInteger(call.points) || call.points < MIN_BID || call.points % BID_STEP !== 0) {
    return `叫分必须是不低于 ${MIN_BID} 的 ${BID_STEP} 的倍数`;
  }
  if (!isHigherBid(call, highest)) return '叫品必须高于当前叫品（分数更高，或同分花色更高）';
  return null;
}

export function bidLabel(call: BidCall): string {
  if (isPass(call)) return 'pass';
  return `${call.points} ${STRAIN_LABEL[call.strain]}`;
}
