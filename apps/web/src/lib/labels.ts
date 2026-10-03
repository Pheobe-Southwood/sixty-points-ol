import {
  bidLabel,
  cardKey,
  isJoker,
  leadInfo,
  levelLabel,
  RANK_LABEL,
  STRAIN_LABEL,
  SUIT_LABEL,
  validateFollow,
  validateLead,
  type BidCall,
  type Card,
  type Level,
  type PersonalView,
  type Seat,
  type Strain,
  type TrumpModel
} from '@sixty/engine';

export const SEAT_NAMES = ['东', '南', '西'] as const;

export function seatLabel(seat: number): string {
  return SEAT_NAMES[seat] ?? String(seat);
}

export function strainText(strain: Strain): string {
  return STRAIN_LABEL[strain];
}

/** 花色字形：用于紧凑的状态条与定约显示（无主用文字） */
export function strainGlyph(strain: Strain): string {
  return strain === 'NT' ? '无主' : SUIT_LABEL[strain];
}

/** 级别拆分：底数（2..A）与右上角「+过次」，如 5(+2) → { rank: '5', cycle: 2 } */
export function levelParts(level: Level): { rank: string; cycle: number } {
  return { rank: level.rank === 14 ? 'A' : String(level.rank), cycle: level.cycle };
}

export function cardText(card: Card): string {
  if (isJoker(card)) return card.joker === 'small' ? '小王' : '大王';
  return `${SUIT_LABEL[card.suit]}${RANK_LABEL[card.rank] ?? card.rank}`;
}

export function callText(call: BidCall): string {
  return call === 'pass' ? '不叫' : bidLabel(call);
}

export function levelText(view: PersonalView, seat: number): string {
  const level = view.levels[seat];
  return level ? levelLabel(level) : '—';
}

export function isTurn(view: PersonalView, seat: Seat, phase: 'auction' | 'play'): boolean {
  const deal = view.deal;
  if (!deal) return false;
  return phase === 'auction' ? deal.auctionTurn === seat : deal.playTurn === seat;
}

export interface LegalityContext {
  readonly hand: readonly Card[];
  readonly trump: TrumpModel;
  readonly lead: readonly Card[] | null;
}

/** 与服务端同一套纯函数做本地预判（最终以服务端判定为准） */
export function checkPlay(ctx: LegalityContext, cards: readonly Card[]): string | null {
  if (cards.length === 0) return null;
  if (ctx.lead === null) return validateLead(ctx.hand, cards, ctx.trump);
  const info = leadInfo(ctx.lead, ctx.trump);
  if (info === null) return '牌局状态异常';
  return validateFollow(ctx.hand, cards, info, ctx.trump);
}

export function handPoints(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => (isJoker(card) ? sum : card.rank === 5 ? sum + 5 : card.rank === 10 || card.rank === 13 ? sum + 10 : sum), 0);
}

export function selectKey(card: Card): string {
  return cardKey(card);
}

/** 叫牌候选：从当前最高叫品的分数起，给出所有合法叫品（步长 5） */
export function bidCandidates(view: PersonalView, spread = 4): { points: number; strains: Strain[] }[] {
  const deal = view.deal;
  if (!deal) return [];
  const highest = deal.highestBid;
  const base = highest?.points ?? 40;
  const rows: { points: number; strains: Strain[] }[] = [];
  const strains: Strain[] = ['C', 'D', 'H', 'S', 'NT'];
  for (let step = 0; step <= spread; step++) {
    const points = base + step * 5;
    const legal = strains.filter((strain) => {
      if (highest === null) return true;
      if (points !== highest.points) return points > highest.points;
      const order: Record<Strain, number> = { C: 0, D: 1, H: 2, S: 3, NT: 4 };
      return order[strain] > order[highest.strain];
    });
    if (legal.length > 0) rows.push({ points, strains: legal });
  }
  return rows;
}
