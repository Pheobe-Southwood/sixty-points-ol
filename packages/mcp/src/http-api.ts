import { ApiError, type GameApi, type SeatlessAction, type TablePayload } from './api.ts';
import type { TableSummary } from './wire.ts';

export interface HttpApiOptions {
  /** 服务器地址，如 https://game.example.com（stdio 侧来自 SIXTY_BASE_URL） */
  readonly baseUrl: string;
  /** 凭据串（base64url(名字:令牌)），与浏览器 localStorage 里那份同物 */
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

/**
 * stdio 侧的实现：工具面 → 现有公开 HTTP 接口。
 *
 * 它只会读 `/view` 与写 `/action`（另有建桌/入座/查桌三个管理动作），
 * 所以「工具面看不到别人的手牌」不是纪律问题，而是它根本没有别的路。
 */
export function httpApi(options: HttpApiOptions): GameApi {
  const base = normalizeBase(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const doFetch = options.fetchImpl ?? fetch;

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
      authorization: `Bearer ${options.credential}`
    };
    if (init.body !== undefined) headers['content-type'] = 'application/json';

    let lastError: unknown = null;
    // 只对「没拿到响应」重试一次：HTTP 4xx 是服务端的判定，重试不会变绿
    for (let attempt = 0; attempt < 2; attempt++) {
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
    throw new ApiError(`连不上服务器（${base}）：${detail}`, 0);
  }

  return {
    async table(code: string): Promise<TablePayload> {
      // `/view` 返回的就是浏览器同款负载（role / view / you / table）
      return (await request(`/api/tables/${encodeURIComponent(code)}/view`)) as TablePayload;
    },

    async act(code: string, action: SeatlessAction): Promise<void> {
      await request(`/api/tables/${encodeURIComponent(code)}/action`, {
        method: 'POST',
        body: JSON.stringify({ action: withSeat(action) })
      });
    },

    async listTables(): Promise<readonly TableSummary[]> {
      const payload = (await request('/api/tables')) as { tables?: TableSummary[] };
      return payload.tables ?? [];
    },

    async createTable(): Promise<string> {
      const payload = (await request('/api/tables', { method: 'POST' })) as { code?: string };
      if (typeof payload.code !== 'string') throw new ApiError('服务器没有返回邀请码', 0);
      return payload.code;
    },

    async enterTable(code: string): Promise<void> {
      await request(`/api/tables/${encodeURIComponent(code)}/join`, { method: 'POST' });
    }
  };
}
