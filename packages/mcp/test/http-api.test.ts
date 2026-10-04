/**
 * stdio 侧的取数实现：**重试策略**只有一条规则 —— 幂等读可以重发，写路径一次都不重发。
 *
 * 为什么这条值得单独一个测试文件：这是「把一次已经生效的动作报成失败」与「凭空多出一张孤儿桌」
 * 的唯一入口（见 ADR-0012）。两种情况都不会在日常跑通时出现，只会在响应丢失时出现，
 * 所以用注入的 `fetchImpl` 把那一刻**确定性地**造出来，而不是等它在生产里偶发。
 *
 * `fetchImpl` 是 `httpApi` 的注入点（`HttpApiOptions`），这里不需要网络、不需要服务器。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../src/api.ts';
import { httpApi } from '../src/http-api.ts';

const BASE = 'http://127.0.0.1:1';

interface Call {
  readonly url: string;
  readonly method: string;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(payload)
  } as unknown as Response;
}

/** 记录每次调用，并把响应体读取改成「先记一笔，再按脚本抛错」 */
function recordingFetch(
  plan: (call: Call, index: number) => Response | Promise<Response>
): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  // 参数类型直接借 `fetch` 自己的（这个包不带 DOM lib，全局 `RequestInfo` 名字不可见）
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const call: Call = { url: String(input), method: (init?.method ?? 'GET').toUpperCase() };
    calls.push(call);
    return plan(call, calls.length - 1);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

/** 响应在「服务端已经提交之后」才失败：连接建了，正文读不出来 */
function committedThenLost(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => {
      throw new Error('terminated（响应在服务端提交之后断开）');
    }
  } as unknown as Response;
}

// ---------------------------------------------------------------- 幂等读：可以重试

test('读（GET）：瞬时失败重发一次，成功后正常返回', async () => {
  let attempts = 0;
  const { fetchImpl, calls } = recordingFetch(() => {
    attempts += 1;
    if (attempts === 1) throw new Error('连接被重置');
    return jsonResponse({ role: 'player', view: null, you: null, table: {} });
  });
  const api = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl });

  const payload = await api.table('ABC123');
  assert.equal(calls.length, 2, '读路径应当重发一次');
  assert.equal(calls[0]!.method, 'GET');
  assert.equal(payload.role, 'player');
});

test('读（GET）：重发也失败时抛「连不上服务器」，不说成「服务器拒绝」', async () => {
  const { fetchImpl, calls } = recordingFetch(() => {
    throw new Error('连接被重置');
  });
  const api = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl });

  await assert.rejects(
    () => api.listTables(),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 0 &&
      error.message.startsWith('连不上服务器') &&
      error.message.includes('连接被重置')
  );
  assert.equal(calls.length, 2);
});

test('4xx 是服务端的判定：不重发，原话带出来', async () => {
  const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ message: '还没轮到你叫牌' }, 400));
  const api = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl });

  await assert.rejects(
    () => api.act('ABC123', { type: 'bid', call: 'pass' }),
    (error: unknown) => error instanceof ApiError && error.status === 400 && error.message === '还没轮到你叫牌'
  );
  assert.equal(calls.length, 1, '4xx 重发不会变绿');
});

// ---------------------------------------------------------------- 写路径：一次都不重发

test('写（POST）：瞬时失败**只发一次**（重发会让已生效的动作变成两次）', async () => {
  const { fetchImpl, calls } = recordingFetch(() => {
    throw new Error('连接被重置');
  });
  const api = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl });

  await assert.rejects(() => api.act('ABC123', { type: 'play', cards: [{ suit: 'C', rank: 5 }] }));
  assert.equal(calls.length, 1, '写路径不该重发');
  assert.equal(calls[0]!.method, 'POST');
});

test('写（POST）：提交后响应丢失时，报「无法确认是否生效」并指路去核对', async () => {
  const { fetchImpl, calls } = recordingFetch(() => committedThenLost({ code: 'AAAAAA' }));
  const api = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl });

  await assert.rejects(
    () => api.enterTable('ABC123'),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 0 &&
      error.message.includes('无法确认这次请求是否已经生效') &&
      error.message.includes('get_state') &&
      !error.message.includes('服务器拒绝')
  );
  assert.equal(calls.length, 1);
});

test('回归：create_table 在响应丢失时不会留下第二张桌（只发一次 POST）', async () => {
  // 就是审查探针造的场面：第一次 POST 真的打到了服务端（桌已建），但读响应时断开。
  // 旧实现在这里重发 → 服务端多一张永远用不到的孤儿桌，而工具把它当成成功返回。
  const { fetchImpl, calls } = recordingFetch(() => committedThenLost({ code: 'AAAAAA' }));
  const api = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl });

  await assert.rejects(() => api.createTable(), /无法确认/);
  assert.equal(calls.length, 1);
  assert.equal(calls.filter((call) => call.url.endsWith('/api/tables')).length, 1);
});

test('写：服务端确实拒绝时仍原样转达（不能因为「不确定」把 4xx 也糊掉）', async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse({ message: '你在观战，入座后才能操作' }, 400));
  const api = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl });

  await assert.rejects(
    () => api.act('ABC123', { type: 'deal' }),
    (error: unknown) => error instanceof ApiError && error.status === 400 && error.message === '你在观战，入座后才能操作'
  );
});

test('写：创建失败且服务端没给邀请码时（200 但形状不对）也说得清楚', async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse({}));
  const api = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl });
  await assert.rejects(() => api.createTable(), /服务器没有返回邀请码/);
});
