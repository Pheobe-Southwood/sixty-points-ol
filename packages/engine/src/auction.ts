import { STRAINS, STRAIN_LABEL, type Strain } from './cards.ts';

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

export interface BidOption {
  readonly points: number;
  readonly strains: readonly Strain[];
}

/**
 * 合法叫品：从当前最高叫品起、步长 5，最多向后看 `spread` 档。
 *
 * 这是**唯一**的合法集实现：牌桌的叫牌面板、牌局编排台与 MCP 工具面的 `legal_bids` 都走它。
 * 合法性只问 `validateCall` —— 花色序与「不低于 40、步长为 5」都在那一个函数里，
 * 这里绝不重写一遍，否则改规则时会出现「工具面说合法、服务端说非法」。
 */
export function bidOptions(highest: Bid | null, spread = 4): readonly BidOption[] {
  const base = highest === null ? MIN_BID : Math.max(MIN_BID, highest.points);
  const rows: BidOption[] = [];
  for (let step = 0; step <= spread; step += 1) {
    const points = base + step * BID_STEP;
    const strains = STRAINS.filter((strain) => validateCall({ points, strain }, highest) === null);
    if (strains.length > 0) rows.push({ points, strains });
  }
  return rows;
}
