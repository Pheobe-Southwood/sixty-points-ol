/**
 * 加/移机器人**路由层**的回归测试：直接调用真 `+server.ts` 的处理函数（真 db、真 lib），
 * 因为守卫与参数解析就写在路由里 —— 只测 lib 层会漏掉它们。
 *
 * 覆盖审查发现的两条：
 * 1. `DELETE` 的座位号守卫在 `?seat=`（空值）与**不带参数**时失效 —— `Number(null)` 与
 *    `Number('')` 都是 0，于是「缺少合法座位号」反而删掉了 0 号位的机器人并返回 200；
 * 2. `POST { seat }` 必须坐进点的那张空座（界面每张空座卡一个按钮），非法座位号要报 400
 *    而不是悄悄退回第一个空座。
 *
 * 沙箱内按包跑：`pnpm run test:web`（`--import ./test/loader.mjs` 见 package.json）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

await import('./server-db.ts');

const { addBot, botSeats } = await import('../src/lib/server/bots.ts');
const { createTable, enterTable, getTableByCode, leaveSeat } = await import('../src/lib/server/tables.ts');
const { createIdentity, credentialOf } = await import('../src/lib/server/auth.ts');
const route = await import('../src/routes/api/tables/[code]/bot/+server.ts');

let seq = 0;
const uniqueName = (prefix: string): string => `${prefix}${Date.now() % 100000}${(seq += 1)}`;

interface Fixture {
  readonly code: string;
  /** 在座的操作者（乙，坐在 1 号位） */
  readonly actorId: number;
  readonly actorCredential: string;
}

/** 一张桌：甲坐 0、乙坐 1，然后甲离座把 0 号位空出来（机器人就该补进这个空座） */
function fixture(): Fixture {
  const a = createIdentity(uniqueName('路由甲'));
  const b = createIdentity(uniqueName('路由乙'));
  assert.ok(a !== null && b !== null, '建身份失败');
  const table = createTable(a.id);
  enterTable(table.code, b.id);
  leaveSeat(table.code, a.id);
  return { code: table.code, actorId: b.id, actorCredential: credentialOf(b) };
}

function eventWith(code: string, query: string, credential: string, body?: unknown): unknown {
  const url = new URL(`http://127.0.0.1/api/tables/${code}/bot${query}`);
  return {
    params: { code },
    url,
    cookies: { get: () => undefined, set: () => undefined, delete: () => undefined },
    request: new Request(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }),
    locals: {},
    fetch,
    getClientAddress: () => '127.0.0.1',
    platform: undefined,
    route: { id: null },
    setHeaders: () => undefined,
    isDataRequest: false,
    isSubRequest: false
  };
}

/** 调处理函数：SvelteKit 的 `error()` 是抛出，所以把「抛出」也归一成状态码 */
async function call(
  handler: (event: never) => unknown,
  code: string,
  query: string,
  credential: string,
  body?: unknown
): Promise<{ status: number; text: string }> {
  try {
    const response = (await handler(eventWith(code, query, credential, body) as never)) as Response;
    return { status: response.status, text: await response.text() };
  } catch (thrown) {
    const status = (thrown as { status?: number }).status;
    if (status === undefined) throw thrown;
    return { status, text: (thrown as { body?: { message?: string } }).body?.message ?? '' };
  }
}

test('DELETE /bot：缺参数、空值、非数字、越界一律 400（不能当成 0 号位）', async () => {
  const { code, actorId, actorCredential } = fixture();
  const tableId = getTableByCode(code)!.id;

  // 把机器人正好放在 0 号位 —— 守卫失效时被误删的就是它
  const added = addBot(code, actorId, 0);
  assert.ok(added.ok, `布景失败：${added.ok ? '' : added.error}`);
  assert.deepEqual(botSeats(tableId).map((row) => row.seat), [0]);

  for (const query of ['', '?seat=', '?seat=abc', '?seat=9', '?seat=-1', '?seat=1.5']) {
    const result = await call(route.DELETE, code, query, actorCredential);
    assert.equal(result.status, 400, `「${query === '' ? '（不带参数）' : query}」应当 400，实际 ${result.status}`);
  }
  assert.deepEqual(botSeats(tableId).map((row) => row.seat), [0], '被拒的请求不该删掉任何机器人');

  const ok = await call(route.DELETE, code, '?seat=0', actorCredential);
  assert.equal(ok.status, 200, `合法删除应当 200，实际 ${ok.status} ${ok.text}`);
  assert.equal(botSeats(tableId).length, 0, '合法请求应真的删掉 0 号位的机器人');
});

test('POST /bot：{ seat } 坐进指定空座；非法座位号 400；不带 seat 退回第一个空座', async () => {
  const { code, actorId, actorCredential } = fixture();
  const tableId = getTableByCode(code)!.id;

  const atTwo = await call(route.POST, code, '', actorCredential, { seat: 2 });
  assert.equal(atTwo.status, 200, `指定座位应当 200，实际 ${atTwo.status} ${atTwo.text}`);
  assert.deepEqual(botSeats(tableId).map((row) => row.seat), [2], '必须坐进指定的座位');

  const bad = await call(route.POST, code, '', actorCredential, { seat: 9 });
  assert.equal(bad.status, 400, '越界座位号应当 400');
  const occupied = await call(route.POST, code, '', actorCredential, { seat: 1 }); // 乙本人在 1 号位
  assert.equal(occupied.status, 400, '已占座位应当 400');

  const byDefault = await call(route.POST, code, '', actorCredential, {});
  assert.equal(byDefault.status, 200);
  assert.ok(botSeats(tableId).some((row) => row.seat === 0), '不带 seat 时应占第一个空座（0 号位）');

  // 未入座的人（甲已离座）加不了机器人
  const outsider = createIdentity(uniqueName('路由丙'))!;
  const refused = await call(route.POST, code, '', credentialOf(outsider), { seat: 0 });
  assert.equal(refused.status, 400, '未入座者加机器人应当 400');
  void actorId;
});
