/**
 * **工具负载投影**：把浏览器同款负载压成给模型看的紧凑形状。
 *
 * 为什么需要它：一副牌从开局到结算，模型要读十几万字符，而其中八成是重复的牌史 ——
 * 结算时 `deal` 有 5,408 字符，光 `trickHistory` 3,111 + `captured` 1,232，而
 * `captured[].cards` 与 `trickHistory` 是**逐张重复**的同一批牌（51 张 = 51 张）。
 * 投影只做三件事：换紧凑编码、删掉重复、把跨副累积的 `history` 压成计分行。
 *
 * 三条纪律（`test/project.test.ts` 与静态守卫一起钉住）：
 *   1. **只减不增**：每个字段都能追到服务器负载里的一个字段，投影不许发明事实；
 *   2. **不许有第二个来源**：本文件只 import 引擎的**类型**与本包的编解码 —— 它读不到
 *      服务器状态，所以「观战者看不到手牌」在投影层依旧成立（观战者 `you === null`）；
 *   3. **浏览器那份不动**：`/view`、SSE 与 `wire.ts` 的 `PublicView` 保持逐字，
 *      投影只发生在 MCP 出参这一侧；要逐字时 `get_state`/`wait_for_turn` 传 `verbose: true`。
 */
import type {
  Contract,
  DealPhase,
  DealSummary,
  GameResult,
  Level,
  PlayerSeat,
  PublicDealView,
  PublicView,
  Seat,
  TrickPlay,
  TrumpModel
} from '@sixty/engine';
import { encodeCall, encodeCard } from './codec.ts';
import type { Role, SeatInfo, StreamPayload, TableView } from './wire.ts';

export interface CompactSeat {
  readonly seat: number;
  readonly name: string | null;
  readonly online: boolean;
}

/** 同桌投影：去掉 `userId`（模型不需要）与 `spectatorCount`（观战徽标是界面的事） */
export interface CompactTable {
  readonly code: string;
  readonly seats: readonly CompactSeat[];
  readonly seatedCount: number;
  readonly ready: boolean;
}

/**
 * 一手牌写成 `"座位:牌码 牌码"`：`"0:C5"`、`"1:H3 H4"`（多张时用空格分隔）。
 *
 * 一手从 `{"seat":0,"cards":["C5"]}`（26 字符）压到 `"0:C5"`（6 字符）——
 * 这是投影里最贵的一处（一副牌 51 手），而座位与「哪几张是一手出的」都不能丢。
 * 出参用这个写法，入参仍是 `cards: ["C5"]` 数组（见 tools.ts）。
 */
export type CompactPlay = string;

export function encodePlay(play: TrickPlay): string {
  return `${play.seat}:${play.cards.map(encodeCard).join(' ')}`;
}

/** `"0:C5 H3"` → `{ seat: 0, cards: ["C5", "H3"] }`：消费方（与测试）需要拆开时用它 */
export function decodePlay(play: string): { readonly seat: Seat; readonly cards: readonly string[] } {
  const separator = play.indexOf(':');
  return {
    seat: Number.parseInt(play.slice(0, separator), 10) as Seat,
    cards: play.slice(separator + 1).split(' ')
  };
}

export interface CompactTrick {
  readonly leaderSeat: Seat;
  readonly plays: readonly CompactPlay[];
}

/**
 * 已完成的墩：赢家 + 分数 + 三手牌。
 *
 * **不给 `leaderSeat`**：它是可推的（第一墩由庄家领出，之后每墩由上墩赢家领出），
 * 而它按墩重复出现 —— 投影里最贵的一个字段就是 `trickHistory`（结算时占负载一半以上），
 * 能推的字段就不重复给。牌换成紧凑码（`"C5"`），墩边界与赢家都留着：记牌能力不削。
 */
export interface CompactCompletedTrick {
  readonly winner: Seat;
  readonly points: number;
  readonly plays: readonly CompactPlay[];
}

/** 结算摘要：只有牌面字段换成紧凑码（其余照原样，结算信息一次性给足） */
export type CompactSummary = Omit<DealSummary, 'kitty' | 'originalKitty'> & {
  readonly kitty: readonly string[];
  readonly originalKitty: readonly string[];
};

export interface CompactDeal {
  readonly phase: DealPhase;
  readonly dealNo: number;
  readonly dealerSeat: Seat;
  readonly auctionTurn: Seat;
  readonly playTurn: Seat | null;
  readonly declarerSeat: Seat | null;
  readonly auction: readonly { readonly seat: Seat; readonly call: string }[];
  readonly highestBid: string | null;
  readonly contract: Contract | null;
  readonly trump: TrumpModel | null;
  readonly trick: CompactTrick | null;
  readonly trickHistory: readonly CompactCompletedTrick[];
  /** 按座位下标：`capturedPoints[seat]`。牌本身不重复给 —— 都在 `trickHistory` 里 */
  readonly capturedPoints: readonly number[];
  readonly handCounts: readonly number[];
  /** 只在结算后非 null：结算信息一次性给足 */
  readonly summary: CompactSummary | null;
}

/** 跨副累积的一行：够看记分板即可，完整摘要只在**本副**结算时给（`deal.summary`） */
export interface CompactHistoryRow {
  readonly dealNo: number;
  readonly contract: Contract;
  readonly finalScore: number;
  readonly made: boolean;
  readonly shortfall: number;
  readonly levelChanges: DealSummary['levelChanges'];
}

/**
 * 只给最近这么多副的明细。
 *
 * 每多打一副，这一行都会被**每个回合**重发一遍（一副牌二十来个回合），所以不加限的话
 * 每副的投喂量会随副数线性上涨：实测第 1 副约 34.5k、第 4 副约 53k，一副比一副贵约 6k。
 *
 * 取 10 是量出来的：本仓库的驱动打完整局通常只要 7 副上下（闲家涨级很快），所以常见情况下
 * 这个上限**等于没裁**（不丢任何东西）；它的作用是给长局一个上界，而不是日常省字符。
 * 被裁掉时如实报出裁了几副（`historyOmitted`）—— 不许让调用方以为历史是全的。
 */
export const HISTORY_LIMIT = 10;

export interface CompactView {
  readonly version: number;
  readonly status: PublicView['status'];
  readonly dealerSeat: Seat;
  readonly dealNo: number;
  readonly levels: readonly Level[];
  readonly progress: readonly number[];
  readonly result: GameResult | null;
  /** 最近 `HISTORY_LIMIT` 副的明细（更早的已裁掉，裁了几副见 `historyOmitted`） */
  readonly history: readonly CompactHistoryRow[];
  /** 被裁掉多少副（0 = 一副都没裁） */
  readonly historyOmitted: number;
  readonly deal: CompactDeal | null;
}

export interface CompactYou {
  readonly seat: Seat;
  readonly hand: readonly string[];
  readonly isDeclarer: boolean;
  readonly originalKitty: readonly string[] | null;
}

/** 投影后的取数结果：与浏览器负载同源、同形到字段级，只是表示更省 */
export interface CompactPayload {
  readonly code: string;
  readonly role: Role;
  readonly table: CompactTable;
  readonly view: CompactView | null;
  readonly you: CompactYou | null;
}

/** 形状守卫：投影的字段清单（`test/project.test.ts` 逐个核对，多一个少一个都红） */
export const COMPACT_VIEW_FIELDS: readonly (keyof CompactView)[] = [
  'version',
  'status',
  'dealerSeat',
  'dealNo',
  'levels',
  'progress',
  'result',
  'history',
  'historyOmitted',
  'deal'
];
export const COMPACT_DEAL_FIELDS: readonly (keyof CompactDeal)[] = [
  'phase',
  'dealNo',
  'dealerSeat',
  'auctionTurn',
  'playTurn',
  'declarerSeat',
  'auction',
  'highestBid',
  'contract',
  'trump',
  'trick',
  'trickHistory',
  'capturedPoints',
  'handCounts',
  'summary'
];
export const COMPACT_HISTORY_FIELDS: readonly (keyof CompactHistoryRow)[] = [
  'dealNo',
  'contract',
  'finalScore',
  'made',
  'shortfall',
  'levelChanges'
];
export const COMPACT_TABLE_FIELDS: readonly (keyof CompactTable)[] = ['code', 'seats', 'seatedCount', 'ready'];
export const COMPACT_SEAT_FIELDS: readonly (keyof CompactSeat)[] = ['seat', 'name', 'online'];
export const COMPACT_YOU_FIELDS: readonly (keyof CompactYou)[] = ['seat', 'hand', 'isDeclarer', 'originalKitty'];
export const COMPACT_SUMMARY_FIELDS: readonly (keyof CompactSummary)[] = [
  'dealNo',
  'contract',
  'trump',
  'declarerTrickPoints',
  'defenderTrickPoints',
  'originalKitty',
  'kitty',
  'lastTrickSize',
  'protectedBottom',
  'multiplier',
  'kittyPoints',
  'finalScore',
  'made',
  'shortfall',
  'levelChanges'
];
export const COMPACT_TRICK_FIELDS: readonly (keyof CompactCompletedTrick)[] = ['winner', 'points', 'plays'];

function seatOf(info: SeatInfo): CompactSeat {
  return { seat: info.seat, name: info.name, online: info.online };
}

export function projectTable(table: TableView): CompactTable {
  return {
    code: table.code,
    seats: table.seats.map(seatOf),
    seatedCount: table.seatedCount,
    ready: table.ready
  };
}

export function projectTrick(trick: NonNullable<PublicDealView['trick']>): CompactTrick {
  return { leaderSeat: trick.leaderSeat, plays: trick.plays.map(encodePlay) };
}

export function projectSummary(summary: DealSummary): CompactSummary {
  return {
    ...summary,
    kitty: summary.kitty.map(encodeCard),
    originalKitty: summary.originalKitty.map(encodeCard)
  };
}

export function projectDeal(deal: PublicDealView): CompactDeal {
  return {
    phase: deal.phase,
    dealNo: deal.dealNo,
    dealerSeat: deal.dealerSeat,
    auctionTurn: deal.auctionTurn,
    playTurn: deal.playTurn,
    declarerSeat: deal.declarerSeat,
    auction: deal.auction.map((entry) => ({ seat: entry.seat, call: encodeCall(entry.call) })),
    highestBid: deal.highestBid === null ? null : encodeCall(deal.highestBid),
    contract: deal.contract,
    trump: deal.trump,
    trick: deal.trick === null ? null : projectTrick(deal.trick),
    trickHistory: deal.trickHistory.map((trick) => ({
      winner: trick.winnerSeat,
      points: trick.points,
      plays: trick.plays.map(encodePlay)
    })),
    capturedPoints: deal.captured.map((entry) => entry.points),
    handCounts: [...deal.handCounts],
    summary: deal.summary === null ? null : projectSummary(deal.summary)
  };
}

export function projectHistoryRow(row: DealSummary): CompactHistoryRow {
  return {
    dealNo: row.dealNo,
    contract: row.contract,
    finalScore: row.finalScore,
    made: row.made,
    shortfall: row.shortfall,
    levelChanges: row.levelChanges
  };
}

function projectYou(you: PlayerSeat): CompactYou {
  return {
    seat: you.seat,
    hand: you.hand.map(encodeCard),
    isDeclarer: you.isDeclarer,
    originalKitty: you.originalKitty === null ? null : you.originalKitty.map(encodeCard)
  };
}

export function projectView(view: PublicView): CompactView {
  const rows = view.history.map(projectHistoryRow);
  const omitted = Math.max(0, rows.length - HISTORY_LIMIT);
  return {
    version: view.version,
    status: view.status,
    dealerSeat: view.dealerSeat,
    dealNo: view.dealNo,
    levels: [...view.levels],
    progress: [...view.progress],
    result: view.result,
    history: omitted === 0 ? rows : rows.slice(omitted),
    historyOmitted: omitted,
    deal: view.deal === null ? null : projectDeal(view.deal)
  };
}

/**
 * 服务器负载 → 工具出参。**唯一的投影入口**，两条传输都走它 —— 所以 stdio 与 `/api/mcp`
 * 不可能给出不同的形状（`verbose` 那条逐字路径也一样，见 tools.ts 的 `stateOf`）。
 */
export function project(payload: StreamPayload, code: string): CompactPayload {
  return {
    code,
    role: payload.role,
    table: projectTable(payload.table),
    view: payload.view === null ? null : projectView(payload.view),
    you: payload.you === null ? null : projectYou(payload.you)
  };
}
