/**
 * 测试替身：一个最小的内存版服务器。
 *
 * 它与真服务器对齐三件事：
 *   1. 座位号由服务端注入（工具面永远不传 seat）；
 *   2. 负载形状与浏览器一致：`view` 是**公共视图**（不含 `you`），`you` 单独一份；
 *   3. 角色由服务端决定 —— `seat: null` 就是观战者（`view` 有、`you` 为 null、动作被拒）。
 *
 * 规则判定直接复用引擎的 dispatch —— 测试里不需要重写一遍规则，
 * 真实的两条 HTTP 链路由 scripts/mcp-check.ts 端到端覆盖。
 */
import {
  createGame,
  dispatch,
  personalView,
  publicView,
  type Action,
  type GameState,
  type Seat
} from '@sixty/engine';
import { ApiError, type GameApi, type SeatlessAction, type TablePayload } from '../src/api.ts';
import type { Role, TableSummary, TableView } from '../src/wire.ts';

/** 固定 RNG：同一局在每次运行里都一样，测试只看规则不看随机 */
export const rng = (): number => 0.5;

export function fakeTableView(code = 'ABC123', online = true, spectatorCount = 0): TableView {
  return {
    code,
    seats: [
      { seat: 0, userId: 1, name: '甲', online: true },
      { seat: 1, userId: 2, name: '乙', online },
      { seat: 2, userId: 3, name: '丙', online: false }
    ],
    seatedCount: 3,
    ready: true,
    spectatorCount
  };
}

function must(result: ReturnType<typeof dispatch>): GameState {
  if (!result.ok) throw new Error(`测试用例自身的动作非法：${result.message}`);
  return result.state;
}

/** 发完牌、还没人叫牌 */
export function dealtState(): GameState {
  return must(dispatch(createGame(0), { type: 'deal' }, rng));
}

/** 拍卖成交（座位 0 叫 40♣、其余 pass），庄家拿着 20 张、还没埋底 */
export function contractState(): GameState {
  let state = dealtState();
  state = must(dispatch(state, { type: 'bid', seat: 0, call: { points: 40, strain: 'C' } }, rng));
  state = must(dispatch(state, { type: 'bid', seat: 1, call: 'pass' }, rng));
  state = must(dispatch(state, { type: 'bid', seat: 2, call: 'pass' }, rng));
  return state;
}

/** 拍卖成交（座位 0 叫 40♣、其余 pass），庄家已埋底，进入打牌且由庄家领出 */
export function playingState(): GameState {
  const state = contractState();
  const hand = state.deal!.hands[0]!;
  return must(dispatch(state, { type: 'bury', seat: 0, cards: hand.slice(0, 3) }, rng));
}

export interface FakeApiOptions {
  readonly state?: GameState | null;
  /** `null` = 观战者（不在座位上） */
  readonly seat?: Seat | null;
  readonly tables?: readonly TableSummary[];
  /** 非 null 时 act/table 一律抛这个错（模拟服务端拒绝或断线） */
  readonly failWith?: ApiError | null;
}

export class FakeApi implements GameApi {
  state: GameState | null;
  readonly seat: Seat | null;
  tables: TableSummary[];
  failWith: ApiError | null;
  /** 工具面实际发出的动作，逐条记录（用来断言「不带 seat」） */
  readonly actions: SeatlessAction[] = [];
  readonly created: string[] = [];
  readonly entered: string[] = [];
  /** table() 被调用了几次（wait_for_turn 的轮询次数靠它数） */
  reads = 0;

  constructor(options: FakeApiOptions = {}) {
    this.state = options.state === undefined ? dealtState() : options.state;
    this.seat = options.seat === undefined ? 0 : options.seat;
    this.tables = options.tables === undefined ? [{ code: 'ABC123', seated: 3, role: 'player' }] : [...options.tables];
    this.failWith = options.failWith ?? null;
  }

  get role(): Role {
    return this.seat === null ? 'spectator' : 'player';
  }

  async table(code: string): Promise<TablePayload> {
    this.reads += 1;
    if (this.failWith !== null) throw this.failWith;
    const state = this.state;
    if (state === null) {
      return { role: this.role, view: null, you: null, table: fakeTableView(code) };
    }
    return {
      role: this.role,
      // 与真服务器一致：公共视图里不含 you，玩家私有那一份单独放在 you
      view: publicView(state),
      you: this.seat === null ? null : personalView(state, this.seat).you,
      table: fakeTableView(code)
    };
  }

  async act(_code: string, action: SeatlessAction): Promise<void> {
    this.actions.push(action);
    if (this.failWith !== null) throw this.failWith;
    // 与 applyTableAction 一致：观战者不能动手
    if (this.seat === null) throw new ApiError('你在观战，入座后才能操作', 400);
    let state = this.state;
    if (state === null) {
      // 与 applyTableAction 一致：还没开局时只有 deal 有意义
      if (action.type !== 'deal') throw new ApiError('三人到齐后由任意一人发牌', 400);
      state = createGame(0);
    }
    const serverAction: Action =
      action.type === 'bid' || action.type === 'bury' || action.type === 'play'
        ? { ...action, seat: this.seat }
        : action;
    this.state = must(dispatch(state, serverAction, rng));
  }

  async listTables(): Promise<readonly TableSummary[]> {
    if (this.failWith !== null) throw this.failWith;
    return this.tables;
  }

  async createTable(): Promise<string> {
    const code = 'NEW111';
    this.created.push(code);
    this.tables = [...this.tables, { code, seated: 1, role: 'player' }];
    return code;
  }

  async enterTable(code: string): Promise<void> {
    this.entered.push(code);
  }
}
