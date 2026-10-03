import {
  cardKey,
  checkPlay as engineCheckPlay,
  isJoker,
  levelLabel,
  RANK_LABEL,
  rankLabel,
  SUIT_LABEL,
  type Bid,
  type BidCall,
  type Card,
  type Level,
  type PublicView,
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

/** 花色字形：用于紧凑的状态条与定约显示（无主用文字） */
export function strainGlyph(strain: Strain): string {
  return strain === 'NT' ? '无主' : SUIT_LABEL[strain];
}

/** 叫品按钮上的字形，与 `strainGlyph` 同源；牌桌与编排台共用一份，不许各写各的 */
export const BID_GLYPH: Record<Strain, string> = {
  C: strainGlyph('C'),
  D: strainGlyph('D'),
  H: strainGlyph('H'),
  S: strainGlyph('S'),
  NT: strainGlyph('NT')
};

/** ♦ ♥ 用红字：牌面与按钮保持同一套色彩语言 */
export function isRedStrain(strain: Strain): boolean {
  return strain === 'H' || strain === 'D';
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

/**
 * 叫品的显示文本：`不叫` 或 `40♣`。
 *
 * 花色一律走 `strainGlyph`（字形/无主），界面任何位置都不许再拼 `STRAIN_LABEL` ——
 * 引擎的 `bidLabel` 是给日志和测试看的（`40 梅花`），不是给牌桌看的。
 */
export function bidText(call: BidCall): string {
  return call === 'pass' ? '不叫' : `${call.points}${strainGlyph(call.strain)}`;
}

/** `bidText` 的别名，保留旧名以免大范围改调用方 */
export function callText(call: BidCall): string {
  return bidText(call);
}

/**
 * 时间上最后一次出手 —— 可能就是「不叫」。
 *
 * 与 `highestCall` 是两个概念：面板顶部的大字要的是**最高叫品**（将要成为定约的那个），
 * 「不叫」只进历史。别把这两个混用。
 */
export function lastCall(view: PublicView): BidCall | null {
  const auction = view.deal?.auction ?? [];
  return auction.length === 0 ? null : auction[auction.length - 1]!.call;
}

/** 当前最高叫品（末尾的非 pass 项）；还没人叫过则为 `null` */
export function highestCall(view: PublicView): Bid | null {
  const auction = view.deal?.auction ?? [];
  for (let i = auction.length - 1; i >= 0; i--) {
    const call = auction[i]!.call;
    if (call !== 'pass') return call;
  }
  return null;
}

export function levelText(view: PublicView, seat: number): string {
  const level = view.levels[seat];
  return level ? levelLabel(level) : '—';
}

export function isTurn(view: PublicView, seat: Seat, phase: 'auction' | 'play'): boolean {
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
/** 与服务端、MCP 的 `check_play` 同一套纯函数做本地预判（最终以服务端判定为准） */
export function checkPlay(ctx: LegalityContext, cards: readonly Card[]): string | null {
  return engineCheckPlay(ctx.hand, cards, ctx.trump, ctx.lead);
}

export function handPoints(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => (isJoker(card) ? sum : card.rank === 5 ? sum + 5 : card.rank === 10 || card.rank === 13 ? sum + 10 : sum), 0);
}

export function selectKey(card: Card): string {
  return cardKey(card);
}

/**
 * 手牌中「来自底牌」的那些牌（多重集合语义）。
 *
 * 用于埋底阶段给庄家标注手牌：`you.originalKitty` 是权威来源，这里只做交集，
 * 不猜、不补、不排序 —— 返回顺序与 `hand` 一致，方便 UI 直接当标记集合用。
 *
 * 同点同花的两张牌在物理上不可区分，对玩家而言标哪一张都一样，所以按 `cardKey` 计数即可。
 */
export function kittyHandDelta(hand: readonly Card[], kitty: readonly Card[] | null): Card[] {
  if (kitty === null || kitty.length === 0) return [];
  const quota = new Map<string, number>();
  for (const card of kitty) {
    const key = cardKey(card);
    quota.set(key, (quota.get(key) ?? 0) + 1);
  }
  const out: Card[] = [];
  for (const card of hand) {
    const key = cardKey(card);
    const left = quota.get(key) ?? 0;
    if (left > 0) {
      quota.set(key, left - 1);
      out.push(card);
    }
  }
  return out;
}

/**
 * 叫牌合法集只有一处实现：引擎包（`bidOptions` 是纯规则，`bidCandidates` 只是从视图里取最高叫品）。
 *
 * 牌桌的叫牌面板、牌局编排台与 MCP 工具面的 `legal_bids` 都走这一份 ——
 * 合法集不允许有第二个来源，否则改规则时会出现「工具面说合法、服务端说非法」。
 * 这里保留同名转出，调用方不必改 import。
 */
export { bidCandidates, bidOptions, type BidOption } from '@sixty/engine';
