import { ApiError, type ClaimedIdentity, type GameApi, type SeatlessAction, type TablePayload } from './api.ts';
import type { TableSummary } from './wire.ts';

export interface HttpApiOptions {
  /** 服务器地址，如 https://game.example.com（stdio 侧来自 SIXTY_BASE_URL） */
  readonly baseUrl: string;
  /**
   * 凭据串（base64url(名字:令牌)），与浏览器 localStorage 里那份同物。
   *
   * **可以为空**：那时是**无身份会话** —— 只有 `read_rules` 与 `claim` 能用（ADR-0014），
   * 请求也不带 `Authorization` 头。
   */
  readonly credential: string;
  readonly timeoutMs?: number | undefined;
  /** 注入点：测试与复用（Node 24 自带 fetch） */
  readonly fetchImpl?: typeof fetch | undefined;
}

interface ErrorBody {
  readonly message?: unknown;
}

/** 把不带 seat 的动作补上占位座位号；服务端会按身份覆盖它（见 api.ts 的说明） */
function withSeat(action: SeatlessAction): unknown {
  switch (action.type) {
    case 'bid':
    case 'bury':
    case 'play':
      return { ...action, seat: 0 };
    default:
      return action;
  }
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** 一次请求的可选行为。**默认不重试**，只有幂等读才允许重试一次（见下）。 */
interface RequestOptions {
  /** 没拿到响应时最多重发几次。只有 `GET` 这类幂等读可以大于 0 */
  readonly retries?: number | undefined;
  /**
   * 覆盖「没拿到响应」时的那句话。
   *
   * 默认那句让调用方去 `get_state` / `list_my_tables` 核对现状，但 `claim` **没有局面可核对** ——
   * 对它说「先去看局面」是错的指路，所以那个工具自带一句。
   */
  readonly failureText?: ((detail: string) => string) | undefined;
  /**
   * 这次请求要不要带上自己的凭据（**默认要**）。
   *
   * 只有 `claim` 给 `false`：它打的是公开端点 `/api/auth/claim`，而那个端点**一旦看见 `Authorization`
   * 就把调用方当成 `current`** —— 于是「claim 自己的名字」会走那条*幂等*分支，把**你自己那把活凭据**
   * 原样回给你，工具面接着会把它当作「给人类的新身份」交出去（ADR-0014 的「凭据只交给人、不接管」
   * 当场破产，人类与 agent 随后共用同一串、互相抢出牌）。
   * 进程内那条路（`/api/mcp` 的 claim 端口）只有 `createIdentity`，任何撞名都失败、也没有 `current`
   * 这个概念 —— **不带凭据才是两条传输答案一致的那一个**。
   */
  readonly sendCredential?: boolean | undefined;
}

/**
 * stdio 侧的实现：工具面 → 现有公开 HTTP 接口。
 *
 * 它只会读 `/view` 与写 `/action`（另有建桌/入座/离座/补位/建身份这几个管理动作），
 * 所以「工具面看不到别人的手牌」不是纪律问题，而是它根本没有别的路。
 */
export function httpApi(options: HttpApiOptions): GameApi {
  const base = normalizeBase(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const doFetch = options.fetchImpl ?? fetch;
  /** 没有凭据就是无身份会话：不发 Authorization，也不假装自己是谁 */
  const credential = options.credential.trim();

  async function request(path: string, init: RequestInit = {}, behavior: RequestOptions = {}): Promise<unknown> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined)
    };
    if (behavior.sendCredential !== false && credential.length > 0) headers['authorization'] = `Bearer ${credential}`;
    if (init.body !== undefined) headers['content-type'] = 'application/json';

    // 写路径（`POST /action`、`POST /api/tables`、`POST /join`、`DELETE /seat`）在服务端没有幂等键：
    // 「读不到响应」不等于「没生效」—— 连接可能在服务端提交之后才断，响应体也可能读到一半失败。
    // 这时候重发会做出两件更糟的事：**把一次已经生效的动作报成失败**，或者凭空多出一张孤儿桌。
    // 所以重试只对幂等读开放（`retries` 由调用方给），写路径一次都不重发，改为如实说「无法确认」。
    const write = (init.method ?? 'GET').toUpperCase() !== 'GET';
    const attempts = write ? 1 : 1 + Math.max(0, behavior.retries ?? 0);
    const failureText = (detail: string): string =>
      behavior.failureText?.(detail) ??
      (write
        ? `无法确认这次请求是否已经生效（${detail}）：先用 get_state / list_my_tables 核对现状，再决定是否重发`
        : `连不上服务器（${base}）：${detail}`);

    let lastError: unknown = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await doFetch(`${base}${path}`, {
          ...init,
          headers,
          signal: AbortSignal.timeout(timeoutMs)
        });
        const text = await response.text();
        const payload: unknown = text.length > 0 ? JSON.parse(text) : null;
        if (!response.ok) {
          const message = (payload as ErrorBody | null)?.message;
          throw new ApiError(typeof message === 'string' ? message : `服务器返回 ${response.status}`, response.status);
        }
        return payload;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        lastError = error;
      }
    }
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new ApiError(failureText(detail), 0);
  }

  return {
    authenticated: credential.length > 0,

    async table(code: string): Promise<TablePayload> {
      // `/view` 返回的就是浏览器同款负载（role / view / you / table）；读是幂等的，可以重试一次
      return (await request(
        `/api/tables/${encodeURIComponent(code)}/view`,
        {},
        { retries: 1 }
      )) as TablePayload;
    },

    async act(code: string, action: SeatlessAction): Promise<void> {
      await request(`/api/tables/${encodeURIComponent(code)}/action`, {
        method: 'POST',
        body: JSON.stringify({ action: withSeat(action) })
      });
    },

    async listTables(): Promise<readonly TableSummary[]> {
      const payload = (await request('/api/tables', {}, { retries: 1 })) as { tables?: TableSummary[] };
      return payload.tables ?? [];
    },

    async createTable(): Promise<string> {
      const payload = (await request('/api/tables', { method: 'POST' })) as { code?: string };
      if (typeof payload.code !== 'string') throw new ApiError('服务器没有返回邀请码', 0);
      return payload.code;
    },

    async enterTable(code: string): Promise<void> {
      await request(`/api/tables/${encodeURIComponent(code)}/join`, { method: 'POST' });
    },

    async leaveSeat(code: string): Promise<void> {
      await request(`/api/tables/${encodeURIComponent(code)}/seat`, { method: 'DELETE' });
    },

    async takeSeat(code: string): Promise<{ seat: number; inherited: boolean }> {
      const payload = (await request(`/api/tables/${encodeURIComponent(code)}/seat`, {
        method: 'POST'
      })) as { seat?: unknown; inherited?: unknown };
      if (typeof payload.seat !== 'number') throw new ApiError('服务器没有返回座位号', 0);
      return { seat: payload.seat, inherited: payload.inherited === true };
    },

    async claim(name: string): Promise<ClaimedIdentity> {
      // 这一步**不带凭据**（`sendCredential: false`）：`/api/auth/claim` 是公开端点，与浏览器大厅
      // 那个「创建身份」同一个；而它一旦看见 `Authorization` 就把调用方当成 `current`，于是
      // 「claim 自己的名字」会走那条*幂等*分支、把你自己那把活凭据回给你（见 RequestOptions 的说明）。
      // 浏览器那条路保留自己的幂等语义（大厅重提交自己的名字就该拿回凭据），MCP 这一侧的定义是
      // **新建或失败** —— 不带凭据才是两条传输一致的那一个。
      const payload = (await request(
        '/api/auth/claim',
        { method: 'POST', body: JSON.stringify({ name }) },
        {
          sendCredential: false,
          // claim 没有局面可核对，所以不能套用那句「先用 get_state 核对」
          failureText: (detail) =>
            `无法确认这个身份是否已经建好（${detail}）：同名再 claim 一次会告诉你「这个名字已被使用」，` +
            '那说明上一次已经生效；否则换个名字重试'
        }
      )) as { name?: unknown; credential?: unknown };
      if (typeof payload.name !== 'string' || typeof payload.credential !== 'string') {
        throw new ApiError('服务器没有返回凭据串', 0);
      }
      return { name: payload.name, credential: payload.credential };
    }
  };
}

/**
 * 无凭据启动时的**可达性自检**：只证明「这个地址上有六十点在跑」，不涉及任何身份。
 *
 * 有凭据那条路仍然用 `listTables()`（它顺带验证凭据）；没有凭据时也得当场分辨「地址写错/服务没起」
 * 与「只是没配身份」—— 后者是合法状态，前者必须立刻以非 0 退出。
 */
export async function probeServer(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000
): Promise<void> {
  const base = normalizeBase(baseUrl);
  try {
    const response = await fetchImpl(`${base}/`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`服务器返回 ${response.status}`);
    // 探针不要响应体（首页是整页 HTML），但也不能不读就丢：能取消就取消
    try {
      await response.body?.cancel();
    } catch {
      /* 响应体读不动不影响「它在跑」这个结论 */
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApiError(`连不上服务器（${base}）：${detail}`, 0);
  }
}
