import {
  BID_STEP,
  bidLabel,
  cardKey,
  isJoker,
  leadInfo,
  levelLabel,
  MIN_BID,
  RANK_LABEL,
  rankLabel,
  STRAINS,
  STRAIN_LABEL,
  SUIT_LABEL,
  validateCall,
  validateFollow,
  validateLead,
  type Bid,
  type BidCall,
  type Card,
  type Level,
  type PersonalView,
  type Seat,
  type Strain,
  type TrumpModel
} from '@sixty/engine';

/**
 * 文本里指代某个座位：本人用「你」，其余用玩家名。
 *
 * 界面上不再出现「东/南/西」：四角座位卡上显示的就是名字，方位在屏幕上没有锚点，
 * 玩家也不会去记自己是哪一方位。座位名由 `TableView.seats[].name` 提供。
 */
export function whoLabel(names: readonly (string | null)[], mySeat: number, seat: number): string {
  if (seat === mySeat) return '你';
  return names[seat] ?? '空座';
}

export function strainText(strain: Strain): string {
  return STRAIN_LABEL[strain];
}

/** 花色字形：用于紧凑的状态条与定约显示（无主用文字） */
export function strainGlyph(strain: Strain): string {
  return strain === 'NT' ? '无主' : SUIT_LABEL[strain];
}

/**
 * 将牌环境的一句话说明：`级牌 5 · 主打 ♥` / `级牌 5 · 无主`。
 *
 * 教程里凡是「3-4-6 是顺子」「副级三张相等」这类例子，都只有在级牌点数已知时才成立，
 * 所以每个示例块都要带上这句，读者不必往上翻去找级牌是几。
 */
export function trumpText(trump: TrumpModel): string {
  return `级牌 ${rankLabel(trump.rank)} · ${trump.strain === 'NT' ? '无主' : `主打 ${SUIT_LABEL[trump.strain]}`}`;
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

export interface BidOption {
  readonly points: number;
  readonly strains: readonly Strain[];
}

/**
 * 叫牌候选：从当前最高叫品的分数起，给出所有合法叫品（步长 5）。
 *
 * 合法性只问引擎的 `validateCall` —— 花色序（♣ < ♦ < ♥ < ♠ < 无主）与「至少 40、步长 5」
 * 都在那一个函数里，界面不许再抄一份，否则改规则时两边会不一致。
 * 牌桌与牌局编排台共用这一份（后者没有服务端视图，只能传一个 `highest`）。
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

/** 牌桌用：从个人视图里取当前最高叫品 */
export function bidCandidates(view: PersonalView, spread = 4): readonly BidOption[] {
  return bidOptions(view.deal?.highestBid ?? null, spread);
}
