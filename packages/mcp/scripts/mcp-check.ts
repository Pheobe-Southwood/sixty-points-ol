/**
 * MCP 端到端：两条传输各打**一整副**（叫牌 → 埋底 → 打牌 → 结算）。
 *
 *   1. stdio：真 spawn `node src/stdio.ts`（SIXTY_CREDENTIAL 从环境变量进）
 *      —— 受限沙箱下 piped stdio 必 EPERM（AGENTS 规则 5），所以给一个 SPAWN=0 的等价形式：
 *      用 SDK 的内存链对把同一套工具表接上「HTTP 版取数」，只是不起子进程。
 *   2. `/api/mcp`：Streamable HTTP 客户端，JSON 模式、无状态，凭据走 Authorization 头。
 *
 * 顺手钉住三件只能对真实服务器验证的事：
 *   - 形状守卫：包内声明的 wire 形状 vs 真实 `/view` 响应逐字段一致
 *   - 在线守卫：MCP 座位没有 SSE，打牌期间必须靠「最近活跃」显示在线
 *   - 权威守卫：故意发一手非法牌，服务端必须拒绝（工具层不许替它放水）
 *
 * 运行（服务端需已启动）：
 *   BASE=http://127.0.0.1:5178 pnpm --filter @sixty/mcp mcp-check
 *   沙箱内安全形式：再加 SPAWN=0
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { cardClass, HELP_KEYS, type Card, type PlayerSeat, type PublicView, type TrumpModel } from '@sixty/engine';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
  createMcpServer,
  httpApi,
  SEAT_FIELDS,
  TABLE_FIELDS,
  VIEW_FIELDS,
  YOU_FIELDS,
  type TableView
} from '../src/index.ts';
import type { TableSummary } from '../src/wire.ts';

const BASE = (process.env['BASE'] ?? 'http://127.0.0.1:5178').replace(/\/+$/, '');
/** 每条传输打几副 */
const DEALS = Number.parseInt(process.env['DEALS'] ?? '1', 10);
const SPAWN = process.env['SPAWN'] !== '0';
const STDIO_ENTRY = fileURLToPath(new URL('../src/stdio.ts', import.meta.url));

/** 固定名字：重跑复用同一批身份（服务端按名字幂等地发凭据） */
const NAMES = ['MCP-check-甲', 'MCP-check-乙', 'MCP-check-丙'] as const;

interface Credential {
  name: string;
  credential: string;
}

let requests = 0;
let rejects = 0;
let toolCalls = 0;
let illegalRejected = false;

// ---------------------------------------------------------------- HTTP 小客户端

async function claim(name: string): Promise<Credential> {
  const response = await fetch(`${BASE}/api/auth/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error(`注册「${name}」失败：${response.status}`);
  return (await response.json()) as Credential;
}

async function http(path: string, init: RequestInit = {}, credential?: string): Promise<unknown> {
  requests += 1;
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (credential !== undefined) headers['authorization'] = `Bearer ${credential}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await response.text();
  const payload: unknown = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${path} → ${response.status} ${(payload as { message?: string } | null)?.message ?? text}`);
  }
  return payload;
}

// ---------------------------------------------------------------- MCP 客户端

function envFor(credential: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string') env[key] = value;
  env['SIXTY_BASE_URL'] = BASE;
  env['SIXTY_CREDENTIAL'] = credential;
  return env;
}

async function connect(kind: 'stdio' | 'http', credential: string): Promise<Client> {
  const client = new Client({ name: `mcp-check-${kind}`, version: '0.1.0' });

  if (kind === 'http') {
    const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${credential}` } }
    });
    await client.connect(transport);
    return client;
  }

  if (SPAWN) {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [STDIO_ENTRY],
      env: envFor(credential),
      stderr: 'inherit'
    });
    await client.connect(transport);
    return client;
  }

  // SPAWN=0：不起子进程，但工具表 / server.ts / http-api.ts 这三层照旧全跑
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ api: httpApi({ baseUrl: BASE, credential }) });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

interface RawToolResult {
  readonly isError?: boolean;
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
}

async function callToolRaw(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<{ ok: boolean; text: string }> {
  toolCalls += 1;
  const result = (await client.callTool({ name, arguments: args })) as RawToolResult;
  const text = result.content?.find((item) => item.type === 'text')?.text ?? '';
  return { ok: result.isError !== true, text };
}

async function tool<T>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { ok, text } = await callToolRaw(client, name, args);
  if (!ok) throw new Error(`工具 ${name} 失败：${text}`);
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------- 形状守卫

function assertKeys(actual: Record<string, unknown>, expected: readonly string[], label: string): void {
  const got = Object.keys(actual).sort().join(',');
  const want = [...expected].sort().join(',');
  assert.equal(got, want, `${label} 的形状与 packages/mcp/src/wire.ts 的声明不一致\n  实际：${got}\n  声明：${want}`);
}

async function checkWireShape(code: string, credential: string): Promise<void> {
  const payload = (await http(`/api/tables/${code}/view`, {}, credential)) as {
    role: unknown;
    view: Record<string, unknown> | null;
    you: Record<string, unknown> | null;
    table: Record<string, unknown>;
  };
  assertKeys(payload.table, TABLE_FIELDS, 'TableView');
  const seats = payload.table['seats'] as Record<string, unknown>[];
  assert.equal(seats.length, 3, 'TableView.seats 必须是三个座位');
  for (const seat of seats) assertKeys(seat, SEAT_FIELDS, 'SeatInfo');

  assert.ok(payload.role === 'player' || payload.role === 'spectator', `role 取值意外：${String(payload.role)}`);
  assert.ok(payload.view !== null, '发过牌就该有公共视图');
  assertKeys(payload.view, VIEW_FIELDS, 'PublicView');
  // 在座的人必须同时拿到自己那一份（手牌在 you 里，公共视图里不许有）
  assert.ok(payload.you !== null, '在座却没有 you：手牌无处可取');
  assertKeys(payload.you, YOU_FIELDS, 'PlayerSeat');
  assert.equal('you' in payload.view, false, '公共视图里不该嵌着 you');
  console.log('形状守卫通过：wire.ts 的声明与真实响应一致（TableView / SeatInfo / PublicView / PlayerSeat）');
}

// ---------------------------------------------------------------- 一副牌的驱动

interface Session {
  readonly client: Client;
  readonly code: string;
  /** 座位 1/2：由 HTTP 直驱（模拟另外两个浏览器玩家） */
  readonly others: readonly { readonly seat: number; readonly credential: string }[];
}

function credentialOf(session: Session, seat: number): string {
  const other = session.others.find((item) => item.seat === seat);
  if (other === undefined) throw new Error(`座位 ${seat} 不在 HTTP 驱动力名单里`);
  return other.credential;
}

interface ViewPayload {
  readonly role: string;
  readonly view: PublicView | null;
  readonly you: PlayerSeat | null;
}

async function otherView(session: Session, seat: number): Promise<PublicView & { you: PlayerSeat }> {
  const payload = (await http(`/api/tables/${session.code}/view`, {}, credentialOf(session, seat))) as ViewPayload;
  if (payload.view === null || payload.you === null) throw new Error(`座位 ${seat} 不是玩家（拿不到手牌）`);
  return { ...payload.view, you: payload.you };
}

/** 直驱另一个座位；成功返回 null，被服务端拒绝返回原因（服务端是唯一裁判） */
async function otherAct(session: Session, seat: number, action: unknown): Promise<string | null> {
  requests += 1;
  const response = await fetch(`${BASE}/api/tables/${session.code}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${credentialOf(session, seat)}` },
    body: JSON.stringify({ action })
  });
  if (response.ok) return null;
  rejects += 1;
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message ?? `HTTP ${response.status}`;
}

async function assertMcpSeatOnline(session: Session): Promise<void> {
  const payload = (await http(`/api/tables/${session.code}/view`, {}, credentialOf(session, 1))) as {
    table: TableView;
  };
  const seat = payload.table.seats.find((item) => item.seat === 0);
  assert.ok(seat !== undefined, '表里没有 0 号座位');
  assert.equal(
    seat.online,
    true,
    'MCP 座位在打牌期间显示离线：它没有 SSE，只能靠「最近活跃」证明自己在场'
  );
}

/** 等一轮必须能超时返回（证明等待是有界的，不会挂住会话） */
async function assertWaitTimesOut(session: Session): Promise<void> {
  const waited = await tool<{ timedOut: boolean; turn: { canAct: boolean } }>(session.client, 'wait_for_turn', {
    code: session.code,
    timeout_seconds: 1
  });
  assert.equal(waited.turn.canAct, false, '明知道不是自己的回合，wait_for_turn 却说能行动');
  assert.equal(waited.timedOut, true, 'wait_for_turn 超时后必须返回 timedOut 而不是一直挂着');
}

/** 一个合法的多张领出必须同门；挑两张门类不同的牌（级牌与王都算主牌，要用引擎的 cardClass 判） */
function twoDifferentClasses(hand: readonly Card[], trump: TrumpModel): Card[] | null {
  const first = hand[0];
  if (first === undefined) return null;
  const other = hand.find((card) => cardClass(card, trump) !== cardClass(first, trump));
  return other === undefined ? null : [first, other];
}

interface StatePayload {
  readonly role: string;
  readonly view: PublicView | null;
  readonly you: PlayerSeat | null;
  readonly turn: { readonly canAct: boolean; readonly phase: string };
}

/** 打完整一副；返回结算后的视图 */
async function playOneDeal(session: Session): Promise<PublicView> {
  let presenceChecked = false;
  let illegalTried = false;
  let waitedOnce = false;
  const getState = (): Promise<StatePayload> => tool<StatePayload>(session.client, 'get_state', { code: session.code });

  let state = await getState();
  if (state.role !== 'player' || state.you === null) {
    throw new Error(`MCP 座位应是在座的玩家，实际 role=${state.role}（检查本脚本的入座步骤）`);
  }
  if (state.view === null || state.view.deal === null || state.view.deal.phase === 'scored') {
    await tool(session.client, 'deal', { code: session.code });
    state = await getState();
  }

  for (let step = 0; step < 400; step++) {
    const view = state.view;
    if (view === null) throw new Error('发完牌却看不到局面');
    const me = state.you;
    if (me === null) throw new Error('轮到出牌却拿不到手牌（you 为 null）');
    const deal = view.deal;
    if (deal === null) throw new Error('发完牌却没有牌局');
    if (deal.phase === 'scored') return view;

    if (!presenceChecked) {
      presenceChecked = true;
      await assertMcpSeatOnline(session);
    }

    switch (deal.phase) {
      case 'auction': {
        const turn = deal.auctionTurn;
        if (turn === 0) {
          if (deal.auction.length === 0) {
            // 用工具面给的合法候选叫第一口 —— 服务端若不接受，说明 legal_bids 撒谎了
            const bids = await tool<{ options: { points: number; strains: string[] }[] }>(
              session.client,
              'legal_bids',
              { code: session.code }
            );
            const first = bids.options[0];
            if (first === undefined) throw new Error('legal_bids 在开局给不出任何候选');
            const strain = first.strains[0];
            if (strain === undefined) throw new Error('legal_bids 的候选没有花色');
            await tool(session.client, 'bid', { code: session.code, call: { points: first.points, strain } });
          } else {
            await tool(session.client, 'bid', { code: session.code, call: 'pass' });
          }
        } else {
          if (!waitedOnce) {
            waitedOnce = true;
            await assertWaitTimesOut(session);
          }
          const other = await otherView(session, turn);
          const call = (other.deal?.auction.length ?? 0) === 0 ? { points: 40, strain: 'C' } : 'pass';
          const error = await otherAct(session, turn, { type: 'bid', call });
          if (error !== null) throw new Error(`座位 ${turn} 叫牌被拒：${error}`);
        }
        break;
      }

      case 'bury': {
        const declarer = deal.declarerSeat;
        if (declarer === null) throw new Error('埋底阶段却没有庄家');
        if (declarer === 0) {
          await tool(session.client, 'bury', { code: session.code, cards: me.hand.slice(0, 3) });
        } else {
          if (!waitedOnce) {
            waitedOnce = true;
            await assertWaitTimesOut(session);
          }
          const other = await otherView(session, declarer);
          const error = await otherAct(session, declarer, { type: 'bury', cards: other.you.hand.slice(0, 3) });
          if (error !== null) throw new Error(`座位 ${declarer} 埋底被拒：${error}`);
        }
        break;
      }

      case 'play': {
        const turn = deal.playTurn;
        if (turn === null) throw new Error('出牌阶段却没有人该出牌');
        if (turn === 0) {
          const leading = deal.trick === null || deal.trick.plays.length === 0;
          if (!illegalTried && leading && deal.trump !== null) {
            illegalTried = true;
            const bad = twoDifferentClasses(me.hand, deal.trump);
            if (bad !== null) {
              const attempt = await callToolRaw(session.client, 'play', { code: session.code, cards: bad });
              assert.equal(attempt.ok, false, '两张不同门类的牌居然被服务端接受了');
              illegalRejected = true;
            }
          }
          let chosen: Card | undefined;
          for (const card of me.hand) {
            const verdict = await tool<{ ok: boolean }>(session.client, 'check_play', {
              code: session.code,
              cards: [card]
            });
            if (verdict.ok) {
              chosen = card;
              break;
            }
          }
          if (chosen === undefined) throw new Error('MCP 座位找不到任何合法的单张');
          await tool(session.client, 'play', { code: session.code, cards: [chosen] });
        } else {
          if (!waitedOnce) {
            waitedOnce = true;
            await assertWaitTimesOut(session);
          }
          const other = await otherView(session, turn);
          let played = false;
          for (const card of other.you.hand) {
            const error = await otherAct(session, turn, { type: 'play', cards: [card] });
            if (error === null) {
              played = true;
              break;
            }
          }
          if (!played) throw new Error(`座位 ${turn} 找不到能出的牌`);
        }
        break;
      }

      default:
        throw new Error(`没见过的阶段：${String(deal.phase)}`);
    }

    state = await getState();
  }

  throw new Error('一副牌走了 400 步还没结算');
}

// ---------------------------------------------------------------- 两条传输各跑一遍

async function listTools(client: Client): Promise<number> {
  const listed = await client.listTools();
  return listed.tools.length;
}

async function runTransport(
  kind: 'stdio' | 'http',
  session0: { code: string; credential: string },
  others: readonly { seat: number; credential: string }[]
): Promise<void> {
  const title =
    kind === 'stdio'
      ? SPAWN
        ? 'stdio（真 spawn node src/stdio.ts）'
        : 'stdio（SPAWN=0：内存链对，不起子进程）'
      : '/api/mcp（Streamable HTTP，JSON 响应模式、无状态）';
  console.log(`\n=== ${title} ===`);

  const client = await connect(kind, session0.credential);
  try {
    const session: Session = { client, code: session0.code, others };

    const count = await listTools(client);
    assert.equal(count, 13, `工具数应为 13，实际 ${count}`);

    const rules = await tool<{ entries: { key: string }[] }>(client, 'read_rules', {});
    assert.deepEqual(
      rules.entries.map((entry) => entry.key),
      [...HELP_KEYS],
      'read_rules 的段列表必须与引擎的 HELP_KEYS 完全一致'
    );

    const tables = await tool<{ tables: readonly TableSummary[] }>(client, 'list_my_tables', {});
    assert.ok(
      tables.tables.some((table) => table.code === session0.code),
      `list_my_tables 没列出 ${session0.code}（GET /api/tables 没把新端点接上？）`
    );

    for (let index = 0; index < DEALS; index++) {
      const scored = await playOneDeal(session);
      const summary = scored.deal?.summary;
      assert.ok(summary !== null && summary !== undefined, '本副结束了却没有结算数据');
      console.log(
        `第 ${summary.dealNo} 副结算：定约 ${summary.contract.points}${summary.contract.strain} · ` +
          `庄家抓 ${summary.declarerTrickPoints} + 底 ${summary.kittyPoints}×${summary.multiplier} = ` +
          `${summary.finalScore} · ${summary.made ? '打成' : '打输'}`
      );
    }
  } finally {
    await client.close();
  }
  console.log(`${title} 通过`);
}

/**
 * 不在座位上的人（观战者）**可以**读这张桌 —— 但只拿得到公共视图。
 *
 * 这条断言换过一次方向：观战模式合入前，未入座读视图应当被 403 拒掉；
 * 现在满座进桌的人会变成观战者，读负载是合法的，**隐藏信息靠负载形状而不是靠状态码**兜住
 * （`you` 为 null）。工具面两条传输必须都照这个来，否则「本地还是远程」会给出不同答案。
 */
async function assertSpectatorSeesNoHand(code: string, credential: string): Promise<void> {
  const payload = (await http(`/api/tables/${code}/view`, {}, credential)) as {
    role: unknown;
    view: Record<string, unknown> | null;
    you: unknown;
  };
  assert.equal(payload.role, 'spectator', '不在座位上的人应被判为观战者');
  assert.equal(payload.you, null, '观战者不该拿到手牌');
  if (payload.view !== null) {
    const raw = JSON.stringify(payload.view);
    assert.equal(raw.includes('"hand"'), false, '公共视图里出现了手牌');
  }
}

// ---------------------------------------------------------------- 主流程

async function main(): Promise<void> {
  console.log(`mcp-check → ${BASE}（每条传输 DEALS=${DEALS}，SPAWN=${SPAWN ? 'on' : 'off'}）`);

  const [mcpSeat, seatB, seatC] = await Promise.all(NAMES.map((name) => claim(name)));
  assert.ok(mcpSeat !== undefined && seatB !== undefined && seatC !== undefined);

  const created = (await http('/api/tables', { method: 'POST' }, mcpSeat.credential)) as { code: string };
  const code = created.code;
  await assertSpectatorSeesNoHand(code, seatC.credential);
  for (const other of [seatB, seatC]) {
    await http(`/api/tables/${code}/join`, { method: 'POST' }, other.credential);
  }
  console.log(`同桌 ${code} 已就绪（MCP 座位 0，另外两个座位由 HTTP 直驱）`);

  // 发副之前公共视图就是 null（还没开局是合法状态，工具面也如实返回）
  const beforeDeal = (await http(`/api/tables/${code}/view`, {}, seatB.credential)) as { view: unknown };
  assert.equal(beforeDeal.view, null, '还没发牌时视图应当是 null');

  // 先发一副，让形状守卫对着**真实的**个人视图核对（而不是空的）
  await http(
    `/api/tables/${code}/action`,
    { method: 'POST', body: JSON.stringify({ action: { type: 'deal' } }) },
    mcpSeat.credential
  );
  await checkWireShape(code, seatB.credential);

  const others = [
    { seat: 1, credential: seatB.credential },
    { seat: 2, credential: seatC.credential }
  ] as const;

  await runTransport('stdio', { code, credential: mcpSeat.credential }, others);
  await runTransport('http', { code, credential: mcpSeat.credential }, others);

  console.log(
    `\n全部通过：HTTP 请求 ${requests}（其中被服务端拒绝 ${rejects} 次，属于故意的试错）· ` +
      `MCP 工具调用 ${toolCalls} 次 · 非法领出被服务端拒绝：${illegalRejected ? '是' : '否（本副 MCP 座位没轮到领出）'}`
  );
}

await main();
