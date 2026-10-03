import type { BidCall, Card } from '@sixty/engine';
import type { StreamPayload, TableSummary } from './wire.ts';

/**
 * 一条不带 seat 的动作：座位号一律由服务端按身份推导（ADR-0002）。
 *
 * 这不是「引擎 Action 的简化版」——它是**工具面唯一允许发出的形状**：
 * 引擎的 `Action` 里 bid/bury/play 都带 seat，客户端填什么都会被服务端覆盖，
 * 所以这一层在类型上就不给 seat 留位置。
 */
export type SeatlessAction =
  | { readonly type: 'deal' }
  | { readonly type: 'newGame' }
  | { readonly type: 'bid'; readonly call: BidCall }
  | { readonly type: 'bury'; readonly cards: readonly Card[] }
  | { readonly type: 'play'; readonly cards: readonly Card[] };

export interface TablePayload extends StreamPayload {}

/** 服务端/传输层拒绝。`status` 为 0 表示没拿到 HTTP 响应（网络或超时）。 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * 工具面唯一的取数出口：只交出**负载**（公共视图 + 自己的那一份），
 * 没有第二个方法能碰到完整牌局状态。两条传输各有一个实现（HTTP / 进程内），
 * 工具层对二者的差异一无所知 —— 两条路因此不可能给出不同答案。
 */
export interface GameApi {
  table(code: string): Promise<TablePayload>;
  act(code: string, action: SeatlessAction): Promise<void>;
  listTables(): Promise<readonly TableSummary[]>;
  createTable(): Promise<string>;
  /** 进入同桌：有空座就入座，满座则以**观战者**身份进入（不再报错） */
  enterTable(code: string): Promise<void>;
}
