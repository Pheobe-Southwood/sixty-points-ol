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
import { httpApi, probeServer } from '../src/http-api.ts';

const BASE = 'http://127.0.0.1:1';

interface Call {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | null;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(payload)
  } as unknown as Response;
}

/** 记录每次调用（含请求头与请求体），并把响应体读取改成「先记一笔，再按脚本抛错」 */
function recordingFetch(
  plan: (call: Call, index: number) => Response | Promise<Response>
): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  // 参数类型直接借 `fetch` 自己的（这个包不带 DOM lib，全局 `RequestInfo` 名字不可见）
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: (init?.headers as Record<string, string> | undefined) ?? {},
      body: typeof init?.body === 'string' ? init.body : null
    };
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

// ---------------------------------------------------------------- 无身份会话（见 ADR-0014）

test('无身份会话：authenticated 为 false，且请求不带 Authorization 头', async () => {
  const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ name: '小六', credential: 'abc.def' }));
  const api = httpApi({ baseUrl: BASE, credential: '   ', fetchImpl });

  assert.equal(api.authenticated, false, '只有空白的凭据也算没带凭据');
  assert.equal(httpApi({ baseUrl: BASE, credential: 'abc' }).authenticated, true);

  await api.claim('小六');
  assert.equal('authorization' in calls[0]!.headers, false, 'claim 是公开端点：不该带（也不该带空的）Authorization');
});

test('claim：POST /api/auth/claim 传 name，成功返回名字与凭据串', async () => {
  const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ name: '小六', credential: 'abc.def' }));
  const api = httpApi({ baseUrl: BASE, credential: '', fetchImpl });

  const claimed = await api.claim('小六');
  assert.deepEqual(claimed, { name: '小六', credential: 'abc.def' });
  assert.equal(calls[0]!.method, 'POST');
  assert.equal(calls[0]!.url, `${BASE}/api/auth/claim`);
  assert.deepEqual(JSON.parse(calls[0]!.body ?? 'null'), { name: '小六' });
});

test('claim：响应丢失时的指路**不能**是「先去看局面」（它没有局面可核对）', async () => {
  const { fetchImpl, calls } = recordingFetch(() => committedThenLost({ name: '小六', credential: 'abc' }));
  const api = httpApi({ baseUrl: BASE, credential: '', fetchImpl });

  await assert.rejects(
    () => api.claim('小六'),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 0 &&
      error.message.includes('无法确认这个身份是否已经建好') &&
      error.message.includes('这个名字已被使用') &&
      !error.message.includes('get_state')
  );
  assert.equal(calls.length, 1, 'claim 也是写路径：一次都不重发');
});

/**
 * 回归：`claim` 在**带着凭据**的连接上也不许挂 `Authorization`。
 *
 * 挂上之后 `/api/auth/claim` 会把调用方当成 `current`，于是「claim 自己的名字」走那条幂等分支、
 * 把调用方**自己那把活凭据**回给工具面，工具面再照着交接说明让人类去导入 —— 人类与 agent 从此
 * 共用一串、互相抢出牌，而 ADR-0014 的「凭据只交给人、不接管」当场破产。
 * 进程内那条路（`/api/mcp` 的 claim 端口）没有 `current`，任何撞名都失败；两条传输必须同答案。
 */
test('claim：连接带着凭据也不挂 Authorization（否则同名会把自己那把凭据交出去）', async () => {
  const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ name: '小六', credential: 'issued.cred' }));
  const api = httpApi({ baseUrl: BASE, credential: 'own.cred', fetchImpl });

  await api.claim('小六');
  assert.equal(
    'authorization' in calls[0]!.headers,
    false,
    'claim 一旦带上凭据，服务端就会把同名的既有身份（可能就是你自己的）返回给我们'
  );

  // 非空转的对照组：同一份凭据在别的调用上**必须**带上 —— 否则上面那条断言也可能只是「全局都没挂」
  await api.listTables();
  assert.equal(calls[1]!.headers['authorization'], 'Bearer own.cred', '除了 claim，别的调用照旧要带凭据');
});

test('claim：服务端没给凭据串时（200 但形状不对）说得清楚', async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse({ name: '小六' }));
  const api = httpApi({ baseUrl: BASE, credential: '', fetchImpl });
  await assert.rejects(() => api.claim('小六'), /服务器没有返回凭据串/);
});

// ---------------------------------------------------------------- 座位双向

test('座位双向：leave_seat 走 DELETE、take_seat 走 POST，都是写路径（不重发）', async () => {
  const { fetchImpl, calls } = recordingFetch((call) =>
    call.method === 'DELETE' ? jsonResponse({ ok: true }) : jsonResponse({ seat: 2, inherited: true })
  );
  const api = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl });

  await api.leaveSeat('ABC123');
  assert.equal(calls[0]!.method, 'DELETE');
  assert.equal(calls[0]!.url, `${BASE}/api/tables/ABC123/seat`);

  const taken = await api.takeSeat('ABC123');
  assert.equal(calls[1]!.method, 'POST');
  assert.equal(calls[1]!.url, `${BASE}/api/tables/ABC123/seat`);
  assert.deepEqual(taken, { seat: 2, inherited: true });

  // 失败时只发一次：DELETE 在服务端本来幂等，但策略统一 —— 非 GET 一律不重发
  const failing = recordingFetch(() => {
    throw new Error('连接被重置');
  });
  const broken = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl: failing.fetchImpl });
  await assert.rejects(() => broken.leaveSeat('ABC123'), /无法确认这次请求是否已经生效/);
  assert.equal(failing.calls.length, 1);
});

test('take_seat：服务端没给座位号（形状不对）时说得清楚', async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse({ inherited: true }));
  const api = httpApi({ baseUrl: BASE, credential: 'x', fetchImpl });
  await assert.rejects(() => api.takeSeat('ABC123'), /服务器没有返回座位号/);
});

// ---------------------------------------------------------------- 无凭据启动探活

test('无凭据启动：探活打的是首页；非 2xx 与连不上都抛带地址的错', async () => {
  const ok = recordingFetch(() => jsonResponse({}));
  await probeServer(BASE, ok.fetchImpl);
  assert.equal(ok.calls[0]!.method, 'GET');
  assert.equal(ok.calls[0]!.url, `${BASE}/`);

  const bad = recordingFetch(() => jsonResponse({ message: 'nope' }, 500));
  await assert.rejects(
    () => probeServer(BASE, bad.fetchImpl),
    (error: unknown) =>
      error instanceof ApiError && error.status === 0 && /连不上服务器.*500/s.test(error.message)
  );

  const dead = recordingFetch(() => {
    throw new Error('ECONNREFUSED');
  });
  await assert.rejects(() => probeServer(BASE, dead.fetchImpl), /连不上服务器.*ECONNREFUSED/s);
});
