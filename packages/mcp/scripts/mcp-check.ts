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
    // 预算只在「打这一副」期间生效：守卫与查桌那些调用不该算进每副的账
    budgetDeals = 0;
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

// ---------------------------------------------------------------- 推送守卫（人类屏幕要跟着动）

interface SeatLine {
  readonly seat: number;
  readonly name: string | null;
  readonly online: boolean;
}

/** 打开一条 SSE 读人类**实际会收到**的帧（每帧就是屏幕上的一次重绘） */
function openStream(code: string, credential: string): { frames: () => unknown[][]; close: () => void } {
  const received: unknown[][] = [];
  const controller = new AbortController();
  void (async () => {
    const response = await fetch(`${BASE}/api/tables/${code}/stream`, {
      headers: { authorization: `Bearer ${credential}`, accept: 'text/event-stream' },
      signal: controller.signal
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n\n');
      while (index !== -1) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const line = frame.split('\n').find((item) => item.startsWith('data: '));
        if (line !== undefined) received.push([JSON.parse(line.slice(6))]);
        index = buffer.indexOf('\n\n');
      }
    }
  })().catch(() => {
    /* 读流在 abort 时抛错是正常的 */
  });
  return { frames: () => received, close: () => controller.abort() };
}

const seatsOfFrame = (frame: unknown[]): SeatLine[] =>
  ((frame[0] as { table: { seats: SeatLine[] } }).table.seats as SeatLine[]) ?? [];

async function waitForFrame(
  stream: { frames: () => unknown[][] },
  label: string,
  predicate: (frame: unknown[]) => boolean,
  timeoutMs = 6_000
): Promise<unknown[]> {
  const startedAt = Date.now();
  for (;;) {
    const match = stream.frames().find(predicate);
    if (match !== undefined) return match;
    if (Date.now() - startedAt >= timeoutMs) {
      const seen = stream.frames().length;
      throw new Error(`${label}：${timeoutMs}ms 内没等到期望的 SSE 帧（共收到 ${seen} 帧）`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** 一张只给推送守卫用的桌：房主 + 一个看着牌的观战者，2 号座位空着 */
async function guardTable(kind: 'stdio' | 'http', tag: string): Promise<{ code: string; watcher: Credential }> {
  const [host, watcher] = await Promise.all([
    claim(`${tag}甲${RUN}${kind[0]}`),
    claim(`${tag}乙${RUN}${kind[0]}`)
  ]);
  assert.ok(host !== undefined && watcher !== undefined);
  const created = (await http('/api/tables', { method: 'POST' }, host.credential)) as { code: string };
  await http(`/api/tables/${created.code}/join`, { method: 'POST' }, watcher.credential);
  return { code: created.code, watcher };
}

/**
 * **推送守卫之一**：MCP 座位入座与轮询，必须让人类的屏幕自己动起来。
 *
 * 这条守卫来自一次真实缺陷（见 ADR-0012）：`enterTable` 过去不广播，而浏览器玩家入座后
 * 必然连上 SSE（连接时会广播一次），所以「入座总能把别人的屏幕刷新」这个隐含前提一直成立 ——
 * 直到 MCP 座位出现（它是第一个没有 SSE 连接的客户端）。人类屏幕上会一直显示「还差 1 人」、
 * 按钮一直是灰的，直到某个人先出一次牌。
 *
 * 用真服务器、真 SSE 流、真工具调用钉住它，而不是读 `/view` 的服务端值：
 * 服务端的值一直是对的，错的是**有没有送出去**。
 */
async function assertJoinPushesToHumans(kind: 'stdio' | 'http', label: string): Promise<void> {
  const { code, watcher } = await guardTable(kind, '推送');
  const joiner = await claim(`推送丙${RUN}${kind[0]}`);
  assert.ok(joiner !== undefined);

  const stream = openStream(code, watcher.credential);
  try {
    await waitForFrame(
      stream,
      '入座前基线',
      (frame) => seatsOfFrame(frame).some((seat) => seat.seat === 2 && seat.name === null)
    );
    const before = stream.frames().length;

    // MCP 座位用**该传输**的 join_table 入座 —— 浏览器与 MCP 走的是同一条到达路径
    const client = await connect(kind, joiner.credential);
    try {
      await tool(client, 'join_table', { code });
    } finally {
      await client.close();
    }

    await waitForFrame(
      stream,
      '入座推送',
      (frame) => seatsOfFrame(frame).some((seat) => seat.seat === 2 && seat.name !== null)
    );
    // 第二半：轮询带来的「最近活跃」也要推出去 —— 那颗点不能一直是灰的
    const online = await waitForFrame(
      stream,
      '在线推送',
      (frame) => seatsOfFrame(frame).some((item) => item.seat === 2 && item.online)
    );
    const seat = seatsOfFrame(online).find((item) => item.seat === 2)!;
    console.log(`  ${label}：人类屏幕自己动了（+${stream.frames().length - before} 帧），座位 2 = ${seat.name}（在线）`);
  } finally {
    stream.close();
  }
}

/**
 * **离线守卫**：真的断了的时候，那颗点要**立刻**变灰，而不是等 60 秒的活跃窗口。
 *
 * 缺陷的形状（见 ADR-0013）：注销连接只清连接表，「最近活跃」还留着 —— 于是关掉标签页之后，
 * 别人的屏幕上他还会绿最多一分钟（实测 58 秒）。守卫**不能**读一次 `/view` 就下结论：
 * 读本身是一次请求，若读的人恰好从离线变在线，会触发广播、给那条（已死的）连接的主人续上窗口 ——
 * 第一版探针就是这么被自己骗过去的。所以这里的观察者**从 t=0 起就持续轮询**（下面 `pollSeat` 每 100ms 读一次），
 * 一直热着，不会有翻转广播来续命。
 */
async function assertDisconnectGoesOffline(kind: 'stdio' | 'http', label: string): Promise<void> {
  // A 桌：丙坐座位 2，乙（观者）当观察者持续轮询；B 桌只用来放丙的第二条连接
  const a = await guardTable(kind, '离线');
  const b = await guardTable(kind, '旁观');
  const guest = await claim(`离线丙${RUN}${kind[0]}`);
  assert.ok(guest !== undefined);
  await http(`/api/tables/${a.code}/join`, { method: 'POST' }, guest.credential);

  /** 座位 2 此刻在服务端算出来的 online（用观者凭据读，读的人保持热） */
  const seat2Online = async (): Promise<boolean> => {
    const payload = (await http(`/api/tables/${a.code}/view`, {}, a.watcher.credential)) as {
      table: { seats: { seat: number; online: boolean }[] };
    };
    return payload.table.seats.find((seat) => seat.seat === 2)?.online === true;
  };

  /** 轮询等它变成期望值，返回耗时；超时返回 null */
  const waitOnline = async (want: boolean, budgetMs: number): Promise<number | null> => {
    const startedAt = Date.now();
    for (;;) {
      if ((await seat2Online()) === want) return Date.now() - startedAt;
      if (Date.now() - startedAt >= budgetMs) return null;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  const firstStream = openStream(a.code, guest.credential);
  try {
    const baseline = await waitOnline(true, 3_000);
    assert.ok(
      baseline !== null,
      `${label}：丙刚连上就该显示在线（基线不成立的话，后面的断言是空的）`
    );

    firstStream.close();
    const elapsed = await waitOnline(false, 3_000);
    if (elapsed === null) {
      // 失败信息里给出最可能的两个原因，省得下一个人重新推一遍
      throw new Error(
        `${label}：丙断开 3 秒后仍显示在线（旧行为要等满 60 秒的活跃窗口）—— ` +
          '检查连接注销后有没有作废「最近活跃」（tables.ts 的 connectionClosed / hub.ts 的 forget）'
      );
    }
    console.log(`  ${label}：断开后 ${elapsed}ms 就变灰（活跃窗口不再拖后腿）`);
  } finally {
    firstStream.close();
  }

  // 他还有别的连接（另一张桌看着牌）时，断开其中一条**不该**让他闪成离线 ——
  // 判据是「这个身份还有没有连接」，不是「这张桌还有没有连接」（在线本来就是身份级判定）
  const elsewhere = openStream(b.code, guest.credential);
  const onTable = openStream(a.code, guest.credential);
  try {
    const back = await waitOnline(true, 3_000);
    assert.ok(back !== null, `${label}：两条连接都连着时应当在线`);
    onTable.close();
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    assert.equal(
      await seat2Online(),
      true,
      `${label}：他还在另一张桌连着，却在这张桌上被判成离线 —— 作废窗口前要先看「还有没有别的连接」`
    );
    elsewhere.close();
    const elapsed = await waitOnline(false, 3_000);
    assert.ok(elapsed !== null, `${label}：最后一条连接也断了，却仍是「在线」`);
    console.log(`  ${label}：还有别的连接时不误判，全部断开后 ${elapsed}ms 变灰`);
  } finally {
    elsewhere.close();
    onTable.close();
  }
}

/**
 * **推送守卫之二**：座位出现这件事不能依赖「入座者随后还会再读一次局面」。
 *
 * 这条是分开的、而且必须分开：`payloadFor` 里的「离线→在线」翻转也会广播，所以一个**第一次**
 * 入座的客户端会顺带把座位推出去 —— 于是只测上面那一条时，就算 `enterTable` 自己不广播，
 * 守卫照样是绿的。这里把入座者先变成一个**最近活跃过**的身份（在别处读一次局面），
 * 于是入座那一次读取不再翻转、不会再广播；此时还能收到帧，就只可能来自 `enterTable` 自己。
 *
 * 这不是人造情形：一个刚在别桌看过牌的人打开新桌链接（或 agent 在 A 桌轮询中途加入 B 桌），
 * 正是「窗口内已经活跃」的入座者。
 */
async function assertJoinPushesEvenWhenJoinerIsActive(kind: 'stdio' | 'http', label: string): Promise<void> {
  const { code, watcher } = await guardTable(kind, '推送热');
  const joiner = await claim(`推送丁${RUN}${kind[0]}`);
  assert.ok(joiner !== undefined);

  const client = await connect(kind, joiner.credential);
  const stream = openStream(code, watcher.credential);
  try {
    await waitForFrame(
      stream,
      '入座前基线',
      (frame) => seatsOfFrame(frame).some((seat) => seat.seat === 2 && seat.name === null)
    );

    // 先读一次局面（还是观战者）：身份变成「最近活跃」，于是下一次读取不会再翻转
    await tool(client, 'get_state', { code });
    const before = stream.frames().length;
    await tool(client, 'join_table', { code });

    await waitForFrame(
      stream,
      '入座推送（入座者已活跃）',
      (frame) => seatsOfFrame(frame).some((seat) => seat.seat === 2 && seat.name !== null)
    );
    console.log(`  ${label}：入座者已活跃过，座位帧仍然送到（+${stream.frames().length - before} 帧）`);
  } finally {
    stream.close();
    await client.close();
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

  // 推送守卫：人类屏幕要跟着动 —— 这是「工具面不只自己能用，还得让别人看见」的那一半
  await assertJoinPushesToHumans(kind, title);
  await assertJoinPushesEvenWhenJoinerIsActive(kind, title);
  // 离线守卫：真断了就要立刻变灰，不能靠 60 秒窗口慢慢忘
  await assertDisconnectGoesOffline(kind, title);

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
