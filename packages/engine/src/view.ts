import { SEATS, type Card, type Seat } from './cards.ts';
import type { Bid, BidCall } from './auction.ts';
import {
  auctionTurn,
  capturedPoints,
  isDeclarerSide,
  playTurn,
  type BidEntry,
  type CompletedTrick,
  type Contract,
  type DealPhase,
  type DealSummary,
  type GameResult,
  type GameState,
  type Level,
  type TrickPlay
} from './state.ts';
import { levelProgress, type Trick } from './state.ts';
import type { TrumpModel } from './order.ts';
import { sortHand } from './order.ts';

/**
 * 公共牌局投影：**观战者也能看到的全部内容**。
 *
 * 这里出现的字段就是「公开」的定义本身，所以庄家私有的东西（例如拿上来的底牌）
 * 一律不放在这里 —— 观战者走的是同一个 builder（`publicDealOf`）。
 */
export interface PublicDealView {
  readonly phase: DealPhase;
  readonly dealNo: number;
  readonly dealerSeat: Seat;
  readonly auction: readonly BidEntry[];
  readonly highestBid: Bid | null;
  readonly auctionTurn: Seat;
  readonly contract: Contract | null;
  readonly trump: TrumpModel | null;
  readonly trick: Trick | null;
  readonly playTurn: Seat | null;
  readonly trickHistory: readonly CompletedTrick[];
  readonly captured: readonly { readonly seat: Seat; readonly points: number; readonly cards: readonly Card[] }[];
  readonly handCounts: readonly number[];
  readonly declarerSeat: Seat | null;
  readonly summary: DealSummary | null;
}

/**
 * 公共视图：不在座位上的人（观战者）能看到的全部内容。
 *
 * 与 **个人视图** 的差别只有一处 —— 没有 `you`（手牌、是否庄家、拿上来的底牌）。
 * 手牌与底牌从一开始就不在这个投影里，而不是在客户端被删掉（见 ADR-0002 / ADR-0007）。
 */
export interface PublicView {
  readonly version: number;
  readonly status: 'playing' | 'finished';
  readonly dealerSeat: Seat;
  readonly dealNo: number;
  readonly levels: readonly Level[];
  readonly progress: readonly number[];
  readonly result: GameResult | null;
  readonly history: readonly DealSummary[];
  readonly deal: PublicDealView | null;
}

/**
 * 玩家私有的一份信息：观战者没有 `you`（见 `role.ts` 的 `projectionFor`）。
 *
 * `originalKitty` = 发牌留下的 3 张暗牌，**只有庄家**非 null。
 * 底牌本来就要并进庄家手牌（`state.ts` 的 bid 分支），所以这对庄家不是新信息 ——
 * 只是把「哪三张是拿上来的」显式说出来，否则 20 张排序后玩家再也认不出它们。
 * 闲家仍要等到结算（`summary.originalKitty`）才可见；放在 `you` 里而不是公共投影里，
 * 是为了让「庄家私有」这件事在类型上就成立：观战者连字段都没有。
 */
export interface PlayerSeat {
  readonly seat: Seat;
  readonly hand: readonly Card[];
  readonly isDeclarer: boolean;
  readonly originalKitty: readonly Card[] | null;
}

export interface PersonalView extends PublicView {
  readonly you: PlayerSeat;
}

/**
 * 服务器权威的公共视图：隐藏他人手牌与底牌（底牌只在结算后随 summary 公开）。
 */
export function publicView(state: GameState): PublicView {
  return {
    version: state.version,
    status: state.status,
    dealerSeat: state.dealerSeat,
    dealNo: state.dealNo,
    levels: state.levels,
    progress: state.levels.map(levelProgress),
    result: state.result,
    history: state.history,
    deal: publicDealOf(state)
  };
}

/**
 * 服务器权威的个人视图：公共视图 + 自己那一份隐藏信息。
 *
 * 唯一的私有例外是**庄家的底牌**（见 `PlayerSeat.originalKitty`）。
 */
export function personalView(state: GameState, seat: Seat): PersonalView {
  const deal = state.deal;
  const isDeclarer = deal !== null && isDeclarerSide(seat, deal);
  return {
    ...publicView(state),
    you: {
      seat,
      hand: deal === null ? [] : sortHand(deal.hands[seat]!, deal.trump),
      isDeclarer,
      originalKitty: isDeclarer ? [...deal.originalKitty] : null
    }
  };
}

function publicDealOf(state: GameState): PublicDealView | null {
  const deal = state.deal;
  if (deal === null) return null;
  return {
    phase: deal.phase,
    dealNo: deal.dealNo,
    dealerSeat: deal.dealerSeat,
    auction: deal.auction.map((e) => ({ ...e })),
    highestBid: highestNonPass(deal.auction),
    auctionTurn: auctionTurn(deal),
    contract: deal.contract,
    trump: deal.trump,
    trick: deal.trick === null ? null : { leaderSeat: deal.trick.leaderSeat, plays: [...deal.trick.plays] },
    playTurn: playTurn(deal),
    trickHistory: deal.trickHistory,
    captured: SEATS.map((s) => ({
      seat: s,
      points: capturedPoints(deal, s),
      cards: deal.captured[s]!
    })),
    handCounts: SEATS.map((s) => deal.hands[s]!.length),
    declarerSeat: deal.contract === null ? null : deal.contract.declarerSeat,
    summary: deal.summary
  };
}

function highestNonPass(entries: readonly BidEntry[]): Bid | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const call: BidCall = entries[i]!.call;
    if (call !== 'pass') return call;
  }
  return null;
}
