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
 * 服务器权威的个人视图：隐藏他人手牌与底牌（底牌只在结算后随 summary 公开）。
 */
export function personalView(state: GameState, seat: Seat): PersonalView {
  const deal = state.deal;
  const publicDeal: PublicDealView | null =
    deal === null
      ? null
      : {
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
      isDeclarer: deal === null ? false : isDeclarerSide(seat, deal)
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
