/**
 * MCP 端到端：两条传输各打**一整副**（叫牌 → 埋底 → 打牌 → 结算）。
 *
 *   1. stdio：真 spawn `node src/stdio.ts`（SIXTY_CREDENTIAL 从环境变量进）
 *      —— 受限沙箱下 piped stdio 必 EPERM（AGENTS 规则 5），所以给一个 SPAWN=0 的等价形式：
 *      用 SDK 的内存链对把同一套工具表接上「HTTP 版取数」，只是不起子进程。
 *   2. `/api/mcp`：Streamable HTTP 客户端，JSON 模式、无状态，凭据走 Authorization 头。
 *
 * 驱动方式就是**给模型推荐的用法**：动作自带等待（`wait` 默认 true），所以每个回合只有一次工具调用；
 * 另外两个座位由 HTTP 并发直驱（真实同桌里他们本来就是独立客户端，串行驱动会让等待干等到超时）。
 * 合法性用引擎本地判（模型手里也有 `turn.legalPlay`），**绝不逐张试** ——
 * 每回合多探几次就把整副牌的读入量抬好几倍，那正是这条工具面要避免的事。
 *
 * 顺手钉住几件只能对真实服务器验证的事：
 *   - 形状守卫：包内声明的 wire 形状 vs 真实 `/view` 响应逐字段一致
 *   - 在线守卫：MCP 座位没有 SSE，打牌期间必须靠「最近活跃」显示在线
 *   - 权威守卫：故意发一手非法牌，服务端必须拒绝（工具层不许替它放水）
 *   - 预算守卫：一副牌的 MCP 调用数与实收字符数都在上界内
 *
 * 运行（服务端需已启动）：
 *   BASE=http://127.0.0.1:5178 pnpm --filter @sixty/mcp mcp-check
 *   沙箱内安全形式：再加 SPAWN=0
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  cardClass,
  checkPlay,
  HELP_KEYS,
  type Card,
  type PlayerSeat,
  type PublicView,
  type TrumpModel
} from '@sixty/engine';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
  createMcpServer,
  decodeCard,
  decodePlay,
  encodeCard,
  httpApi,
  SEAT_FIELDS,
  TABLE_FIELDS,
  VIEW_FIELDS,
  YOU_FIELDS,
  type CompactView,
  type CompactYou,
  type TableView,
  type TurnSummary
} from '../src/index.ts';
import type { TableSummary } from '../src/wire.ts';

const BASE = (process.env['BASE'] ?? 'http://127.0.0.1:5178').replace(/\/+$/, '');
/** 每条传输打几副 */
const DEALS = Number.parseInt(process.env['DEALS'] ?? '1', 10);
const SPAWN = process.env['SPAWN'] !== '0';
const STDIO_ENTRY = fileURLToPath(new URL('../src/stdio.ts', import.meta.url));

/**
 * 一副牌的预算。
 *
 * **调用数才是真正的探测器**：逐张 `check_play` 会让它从 20 出头涨到 40 以上，
 * 而每次探测还要把整段会话再投喂一遍 —— 那才是这条工具面要避免的浪费。
 * 字节数是粗线条的第二道：它随副数缓慢增长（`history` 每副多一行），所以留得宽松些。
 */
const CALLS_PER_DEAL = 26;
const BYTES_PER_DEAL = 60_000;

/**
 * 每次跑用一批新名字：注册是**不许重名**的（PR #1 修掉了「重名就返回那条已有身份」的接管口子），
 * 所以固定名字在同一个库里只能成功一次 —— 本脚本要能反复跑。
 * 名字上限 12 个字符（`normalizeName`），所以后缀只有 5 位。
 */
const RUN = Math.random().toString(36).slice(2, 7);
const NAMES = [`MCP甲-${RUN}`, `MCP乙-${RUN}`, `MCP丙-${RUN}`] as const;

interface Credential {
  name: string;
  credential: string;
}

let requests = 0;
let rejects = 0;
let toolCalls = 0;
let delivered = 0;
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
  delivered += text.length;
  assertBudget();
  return { ok: result.isError !== true, text };
}

async function tool<T>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { ok, text } = await callToolRaw(client, name, args);
  if (!ok) throw new Error(`工具 ${name} 失败：${text}`);
  return JSON.parse(text) as T;
}

/** 一副牌的花费：调用数没超、字节数没超（每打一次就查一次，超了就当场红） */
let budgetStartCalls = 0;
let budgetStartBytes = 0;
let budgetDeals = 0;
function assertBudget(): void {
  if (budgetDeals === 0) return;
  const calls = toolCalls - budgetStartCalls;
  const bytes = delivered - budgetStartBytes;
  if (calls > CALLS_PER_DEAL) {
    throw new Error(`一副牌的 MCP 调用数 ${calls} 超过预算 ${CALLS_PER_DEAL}：是不是又在逐张试探了？`);
  }
  if (bytes > BYTES_PER_DEAL) {
    throw new Error(`一副牌的实收负载 ${bytes} 字符超过预算 ${BYTES_PER_DEAL}`);
  }
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

// ---------------------------------------------------------------- 另外两个座位（HTTP 并发直驱）

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

/** 帮某个座位走一手（只挑合法的单张；轮不到它就什么都不做） */
async function moveSeat(session: Session, seat: number): Promise<boolean> {
  const view = await otherView(session, seat);
  const deal = view.deal;
  if (deal === null) return false;

  if (deal.phase === 'auction' && deal.auctionTurn === seat) {
    const call = deal.highestBid === null ? { points: 40, strain: 'C' } : 'pass';
    return (await otherAct(session, seat, { type: 'bid', call })) === null;
  }
  if (deal.phase === 'bury' && deal.declarerSeat === seat) {
    return (await otherAct(session, seat, { type: 'bury', cards: view.you.hand.slice(0, 3) })) === null;
  }
  if (deal.phase === 'play' && deal.playTurn === seat && deal.trump !== null) {
    const trump: TrumpModel = deal.trump;
    const lead = deal.trick !== null && deal.trick.plays.length > 0 ? deal.trick.plays[0]!.cards : null;
    const card = view.you.hand.find((candidate) => checkPlay(view.you.hand, [candidate], trump, lead) === null);
    if (card === undefined) return false;
    return (await otherAct(session, seat, { type: 'play', cards: [card] })) === null;
  }
  return false;
}

interface Others {
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
}

/**
 * 后台把另外两个座位往前推。
 *
 * 必须并发：MCP 座位的动作会**阻塞等到下一次轮到自己**，串行驱动只会让它等到超时。
 * 被拒是正常的（可能读到的是旧局面），这里一律忽略、下一轮再看。
 */
function startOthers(session: Session): Others {
  let stopped = false;
  let paused = false;
  const loop = (async () => {
    while (!stopped) {
      if (!paused) {
        for (const other of session.others) {
          if (stopped) break;
          try {
            await moveSeat(session, other.seat);
          } catch {
            // 旧局面导致的拒绝、或瞬时失败：忽略，下一轮再试
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  })();
  return {
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    stop: async () => {
      stopped = true;
      await loop;
    }
  };
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
async function assertWaitTimesOut(session: Session, others: Others): Promise<void> {
  others.pause();
  try {
    const waited = await tool<{ timedOut: boolean; turn: { canAct: boolean } }>(session.client, 'wait_for_turn', {
      code: session.code,
      timeout_seconds: 0
    });
    assert.equal(waited.turn.canAct, false, '明知道不是自己的回合，wait_for_turn 却说能行动');
    assert.equal(waited.timedOut, true, 'wait_for_turn 超时后必须返回 timedOut 而不是一直挂着');
  } finally {
    others.resume();
  }
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
  readonly view: CompactView | null;
  readonly you: CompactYou | null;
  readonly turn: TurnSummary;
  readonly timedOut?: boolean;
}

function cardsOfView(codes: readonly string[]): Card[] {
  return codes.map((code) => {
    const card = decodeCard(code);
    if (card === null) throw new Error(`工具面吐出了认不出的牌码：${code}`);
    return card;
  });
}

/** 当前这一墩的领出牌（引擎牌）；没人出过牌则是 null */
function leadOfView(view: CompactView): Card[] | null {
  const trick = view.deal?.trick ?? null;
  return trick === null || trick.plays.length === 0 ? null : cardsOfView(decodePlay(trick.plays[0]!).cards);
}

/**
 * MCP 座位该出哪张：**在本地算**（模型手里有 `turn.legalPlay` 与 `you.hand`，也一样不该逐张试）。
 * 返回牌码，可以直接喂回 `play`。
 */
function pickPlay(state: StatePayload): string {
  const view = state.view;
  if (view === null || state.you === null || view.deal === null || view.deal.trump === null) {
    throw new Error('轮到出牌却拿不到必要信息');
  }
  const trump: TrumpModel = view.deal.trump;
  const hand = cardsOfView(state.you.hand);
  const card = hand.find((candidate) => checkPlay(hand, [candidate], trump, leadOfView(view)) === null);
  if (card === undefined) throw new Error('MCP 座位找不到任何合法的单张');
  return encodeCard(card);
}

/** 用「每回合一次调用」的节奏打完整副；返回结算后的局面 */
async function playOneDeal(session: Session): Promise<CompactView> {
  const others = startOthers(session);
  let presenceChecked = false;
  let illegalTried = false;
  let waitedOnce = false;
  budgetStartCalls = toolCalls;
  budgetStartBytes = delivered;
  budgetDeals += 1;

  try {
    let state = await tool<StatePayload>(session.client, 'get_state', { code: session.code });
    if (state.role !== 'player' || state.you === null) {
      throw new Error(`MCP 座位应是在座的玩家，实际 role=${state.role}（检查本脚本的入座步骤）`);
    }
    // 这张桌的当前一副已经结束（上一条传输打完了）或还没开局：先开一副 —— 「我这一副」是新的
    const opening = state.view?.deal ?? null;
    if (opening === null || opening.phase === 'scored') {
      state = await tool<StatePayload>(session.client, 'deal', { code: session.code });
    }

    for (let step = 0; step < 40; step += 1) {
      const view = state.view;
      const deal = view?.deal ?? null;
      if (deal !== null && deal.phase === 'scored') return view!;

      if (!presenceChecked) {
        presenceChecked = true;
        await assertMcpSeatOnline(session);
      }

      // 不是自己能动的时刻（例如别人刚发完牌）：等一次，超时就重来 —— 绝不去猜着动手
      if (!state.turn.canAct) {
        state = await tool<StatePayload>(session.client, 'wait_for_turn', { code: session.code });
        continue;
      }

      if (deal === null) {
        state = await tool<StatePayload>(session.client, 'deal', { code: session.code });
        continue;
      }

      switch (deal.phase) {
        case 'auction': {
          const option = state.turn.legalBids?.[0];
          assert.ok(option !== undefined, '轮到叫牌却没给 turn.legalBids');
          const strain = option.strains[0];
          assert.ok(strain !== undefined, 'turn.legalBids 的候选没有花色');
          const call = deal.auction.length === 0 ? { points: option.points, strain } : 'pass';
          if (!waitedOnce) {
            // 顺手钉住「等待有界」：先不等待地叫一口（此刻就不是自己的回合了），
            // 再从一个「轮不到自己」的位置等一次 —— 必须超时返回，而不是挂住会话
            waitedOnce = true;
            state = await tool<StatePayload>(session.client, 'bid', { code: session.code, call, wait: false });
            await assertWaitTimesOut(session, others);
            continue;
          }
          state = await tool<StatePayload>(session.client, 'bid', { code: session.code, call });
          break;
        }

        case 'bury': {
          state = await tool<StatePayload>(session.client, 'bury', {
            code: session.code,
            cards: state.you!.hand.slice(0, 3)
          });
          break;
        }

        case 'play': {
          const leading = deal.trick === null || deal.trick.plays.length === 0;
          if (!illegalTried && leading && deal.trump !== null) {
            illegalTried = true;
            const bad = twoDifferentClasses(cardsOfView(state.you!.hand), deal.trump);
            if (bad !== null) {
              const attempt = await callToolRaw(session.client, 'play', {
                code: session.code,
                cards: bad.map(encodeCard),
                wait: false
              });
              assert.equal(attempt.ok, false, '两张不同门类的牌居然被服务端接受了');
              illegalRejected = true;
            }
          }
          state = await tool<StatePayload>(session.client, 'play', {
            code: session.code,
            cards: [pickPlay(state)]
          });
          break;
        }

        default:
          throw new Error(`没见过的阶段：${String(deal.phase)}`);
      }
    }

    throw new Error(`一副牌走了 40 步还没结算（副数 ${budgetDeals}）`);
  } finally {
    await others.stop();
  }
}

/**
 * 观战者能读到这张桌，但只拿得到公共视图。
 *
 * 隐藏信息靠**负载形状**兜住（`you` 为 null），而不是靠状态码：满座进桌的人就是观战者。
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

    // 上一副结算后 history 会多一行，所以每副单独算预算
    for (let index = 0; index < DEALS; index++) {
      const before = { calls: toolCalls, bytes: delivered };
      const scored = await playOneDeal(session);
      const summary = scored.deal?.summary;
      assert.ok(summary !== null && summary !== undefined, '本副结束了却没有结算数据');
      console.log(
        `第 ${summary.dealNo} 副结算：定约 ${summary.contract.points}${summary.contract.strain} · ` +
          `庄家抓 ${summary.declarerTrickPoints} + 底 ${summary.kittyPoints}×${summary.multiplier} = ` +
          `${summary.finalScore} · ${summary.made ? '打成' : '打输'} · ` +
          `本副 ${toolCalls - before.calls} 次调用 / ${delivered - before.bytes} 字符`
      );
      // 下一副：动作自带等待会把我们带到「能发牌」的状态，这里只需要再发一次
      if (index + 1 < DEALS) {
        await tool(session.client, 'deal', { code: session0.code });
      }
    }
  } finally {
    await client.close();
  }
  console.log(`${title} 通过`);
}

// ---------------------------------------------------------------- 主流程

async function main(): Promise<void> {
  console.log(
    `mcp-check → ${BASE}（每条传输 DEALS=${DEALS}，SPAWN=${SPAWN ? 'on' : 'off'}，` +
      `预算 ≤ ${CALLS_PER_DEAL} 次调用 / ${BYTES_PER_DEAL} 字符每副）`
  );

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
      `MCP 工具调用 ${toolCalls} 次 · 工具结果共 ${delivered} 字符 · ` +
      `非法领出被服务端拒绝：${illegalRejected ? '是' : '否（本副 MCP 座位没轮到领出）'}`
  );
}

await main();
