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

export interface PublicDealView {
  readonly phase: DealPhase;
  readonly dealNo: number;
  readonly dealerSeat: Seat;
  readonly auction: readonly BidEntry[];
  readonly highestBid: Bid | null;
  /**
   * 发牌留下的 3 张暗牌；**只有庄家**看得到，闲家恒为 `null`。
   *
   * 底牌本来就要并进庄家手牌（`state.ts` 的 bid 分支），所以这对庄家不是新信息 ——
   * 只是把「哪三张是拿上来的」显式说出来，否则 20 张排序后玩家再也认不出它们。
   * 闲家仍要等到结算（`summary.originalKitty`）才可见。
   */
  readonly originalKitty: readonly Card[] | null;
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

export interface PersonalView {
  readonly version: number;
  readonly status: 'playing' | 'finished';
  readonly dealerSeat: Seat;
  readonly dealNo: number;
  readonly levels: readonly Level[];
  readonly progress: readonly number[];
  readonly result: GameResult | null;
  readonly history: readonly DealSummary[];
  readonly deal: PublicDealView | null;
  readonly you: { readonly seat: Seat; readonly hand: readonly Card[]; readonly isDeclarer: boolean };
}

/**
 * 服务器权威的个人视图：隐藏他人手牌与底牌。
 *
 * 唯一的例外是**庄家**：成交后底牌本来就并进他的手牌，所以个人视图把发牌留下的 3 张
 * （`deal.originalKitty`）一并交给他，好让界面点明「哪三张是拿上来的」；闲家仍为 `null`，
 * 结算后才随 `summary.originalKitty` 公开。
 */
export function personalView(state: GameState, seat: Seat): PersonalView {
  const deal = state.deal;
  const isDeclarer = deal !== null && isDeclarerSide(seat, deal);
  const publicDeal: PublicDealView | null =
    deal === null
      ? null
      : {
          phase: deal.phase,
          dealNo: deal.dealNo,
          dealerSeat: deal.dealerSeat,
          auction: deal.auction.map((e) => ({ ...e })),
          highestBid: highestNonPass(deal.auction),
          originalKitty: isDeclarer ? [...deal.originalKitty] : null,
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

  return {
    version: state.version,
    status: state.status,
    dealerSeat: state.dealerSeat,
    dealNo: state.dealNo,
    levels: state.levels,
    progress: state.levels.map(levelProgress),
    result: state.result,
    history: state.history,
    deal: publicDeal,
    you: {
      seat,
      hand: deal === null ? [] : sortHand(deal.hands[seat]!, deal.trump),
      isDeclarer
    }
  };
}

function highestNonPass(entries: readonly BidEntry[]): Bid | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const call: BidCall = entries[i]!.call;
    if (call !== 'pass') return call;
  }
  return null;
}
