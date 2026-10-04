import type { Action } from '@sixty/engine';
import { ApiError, type GameApi, type SeatlessAction, type TablePayload } from '@sixty/mcp';
import { applyTableAction, createTable, enterTable, getTableByCode, myTables, payloadFor } from './tables';

/**
 * 进程内版的 `GameApi`：`/api/mcp` 路由用它，stdio 侧用的是 HTTP 版（packages/mcp）。
 *
 * 两件事必须同时成立：
 *
 * 1. **它只调 tables.ts 里那几个公开函数**，一个字节都不碰 `getGameState`/`db`/`dispatch` ——
 *    工具面拿不到完整牌局状态，所以「MCP 客户端看不到别人的手牌与底牌」不靠自律，
 *    靠这里没有别的路可走（由 apps/web/test/mcp-guard.test.ts 静态断言，并按 AGENTS 规则 9 证明守卫非空）。
 * 2. **行为与 HTTP 路由逐条对齐**（见 `routes/api/tables/[code]/view` 与 `.../join`）：
 *    读负载不要求入座（不在座位上的人拿到的是观战负载，即公共视图 + `you: null`），
 *    动作才要求座位。否则同一套 MCP 工具会因为「本地还是远程」给出不同答案。
 */
function toEngineAction(action: SeatlessAction): Action {
  // 座位号：服务端按身份覆盖（ADR-0002），这里填 0 只是满足引擎的类型
  switch (action.type) {
    case 'bid':
    case 'bury':
    case 'play':
      return { ...action, seat: 0 };
    default:
      return action;
  }
}

export function serverApi(userId: number): GameApi {
  return {
    async table(code: string): Promise<TablePayload> {
      const table = getTableByCode(code);
      if (table === null) throw new ApiError('同桌不存在', 404);
      // payloadFor 现算角色：在座 → 个人视图（公共 + you），观战 → 公共视图（you 为 null）
      return payloadFor(table, userId);
    },

    async act(code: string, action: SeatlessAction): Promise<void> {
      const result = applyTableAction(code, userId, toEngineAction(action));
      if (!result.ok) throw new ApiError(result.message, 400);
    },

    async listTables() {
      return myTables(userId);
    },

    async createTable(): Promise<string> {
      return createTable(userId).code;
    },

    async enterTable(code: string): Promise<void> {
      const result = enterTable(code, userId);
      if ('error' in result) throw new ApiError(result.error, 400);
    }
  };
}
