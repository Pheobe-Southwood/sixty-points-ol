/**
 * 机器人座位端到端：真服务器 + 真 SSE，1 人 + 2 机器人打完一整副，再中途踢/补一轮。
 *
 * 与 `spectate-check` / `smoke` 同一路数（只走 HTTP，不 import 服务端模块），
 * 但**人类座位也由同一份策略驱动**（`@sixty/bot` 的 `moveFor`）——
 * 于是这副牌同时验证两件事：服务器调度器真的在替机器人出手，
 * 以及策略给出的每一个动作都被真实服务器接受（合法即构造的端到端证据）。
 *
 * 运行：BASE=http://127.0.0.1:5178 pnpm --filter web bot
 *   想跑快就把服务端延迟调零：SIXTY_BOT_DELAY_MIN_MS=0 SIXTY_BOT_DELAY_MAX_MS=0
 */
import { moveFor, type BotMove } from '@sixty/bot';

const BASE = process.env['BASE'] ?? 'http://127.0.0.1:5178';
/** 一副牌的等待上限（默认延迟 0.5–1.5 秒，一副 ~20 手，60 秒足够宽松） */
const DEAL_TIMEOUT_MS = Number(process.env['DEAL_TIMEOUT_MS'] ?? 60_000);
const SSE_READ_TIMEOUT_MS = 15_000;

interface Card {
  suit?: string;
  rank?: number;
  joker?: string;
}

interface DealView {
  phase: 'auction' | 'bury' | 'play' | 'scored';
  dealNo: number;
  auctionTurn: number;
  playTurn: number | null;
  declarerSeat: number | null;
  handCounts: number[];
  summary: { dealNo: number; finalScore: number; made: boolean } | null;
}

interface View {
  version: number;
  status: 'playing' | 'finished';
  dealNo: number;
  deal: DealView | null;
}

interface SeatInfo {
  seat: number;
  userId: number | null;
  name: string | null;
  online: boolean;
  bot: boolean;
}

interface Payload {
  role: 'player' | 'spectator';
  view: View | null;
  you: { seat: number; hand: Card[]; isDeclarer: boolean } | null;
  table: { code: string; seats: SeatInfo[]; seatedCount: number; ready: boolean };
}

let requests = 0;

async function api(path: string, init: RequestInit = {}, credential?: string): Promise<unknown> {
  requests += 1;
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (credential) headers['authorization'] = `Bearer ${credential}`;
  if (init.body) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await response.text();
  const payload = text.length > 0 ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message = (payload as { message?: string } | null)?.message ?? text;
    throw new Error(`${path} → ${response.status} ${message}`);
  }
  return payload;
}

/** 故意违规/越权的调用：返回状态码与消息，而不是抛错 */
async function tryApi(
  path: string,
  init: RequestInit,
  credential?: string
): Promise<{ status: number; message: string }> {
  requests += 1;
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (credential) headers['authorization'] = `Bearer ${credential}`;
  if (init.body) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return { status: response.status, message: payload?.message ?? '' };
}

async function payloadOf(code: string, credential: string): Promise<Payload> {
  return (await api(`/api/tables/${code}/view`, {}, credential)) as Payload;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function toAction(move: BotMove): unknown {
  if (move.type === 'bid') return { type: 'bid', call: move.call };
  if (move.type === 'bury') return { type: 'bury', cards: move.cards };
  return { type: 'play', cards: move.cards };
}

/** 人类座位此刻该做什么（拿不到动作 = 不归它动） */
function humanMove(payload: Payload): BotMove | null {
  if (payload.view === null || payload.you === null) return null;
  return moveFor(payload.view, payload.you);
}

/**
 * SSE 帧读取器：后台泵把帧收进队列，取帧带超时。
 *
 * 不直接对 `reader.read()` 做 `Promise.race` —— 输给超时的那次 read 还挂着，
 * 下一次再 read 就是「同一个 reader 并发读」，运行时会直接报错（踩过）。
 */
class Stream {
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>;
  #frames: Payload[] = [];
  #waiters: Waiter[] = [];
  #closed = false;
  /** 收到的帧数：机器人出手也会推帧，帧数明显多于人类出手数就是「推送真的在工作」 */
  frameCount = 0;

  // 注意：不能用 TS 的参数属性（`constructor(private readonly x)`）——
  // node 的类型擦除模式不支持它（ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX）。
  private constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
    this.#reader = reader;
  }

  static async open(code: string, credential: string): Promise<Stream> {
    const response = await fetch(`${BASE}/api/tables/${code}/stream`, {
      headers: { authorization: `Bearer ${credential}` }
    });
    if (!response.ok || response.body === null) throw new Error(`SSE 连接失败：${response.status}`);
    const stream = new Stream(response.body.getReader());
    void stream.#pump();
    return stream;
  }

  async #pump(): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const chunk = await this.#reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        for (;;) {
          const boundary = buffer.indexOf('\n\n');
          if (boundary < 0) break;
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const line = block.split('\n').find((item) => item.startsWith('data: '));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6)) as Payload;
          this.frameCount += 1;
          const waiter = this.#waiters.shift();
          if (waiter !== undefined) waiter.resolve(payload);
          else this.#frames.push(payload);
        }
      }
    } catch {
      // 连接断了：下面按 closed 处理，调用方会退回轮询
    }
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter.resolve(null);
  }

  /** 取下一帧；超时返回 null（调用方用轮询兜底） */
  async next(timeoutMs: number): Promise<Payload | null> {
    const queued = this.#frames.shift();
    if (queued !== undefined) return queued;
    if (this.#closed) return null;
    let entry: Waiter | undefined;
    const waiting = new Promise<Payload | null>((resolve) => {
      entry = { resolve, done: false };
      this.#waiters.push(entry);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    const outcome = await Promise.race([waiting, timeout]);
    if (outcome === 'timeout') {
      if (entry !== undefined) {
        entry.done = true;
        // 超时的那张票作废：免得它吃掉后面某一帧（帧丢了，界面就会停住）
        const index = this.#waiters.indexOf(entry);
        if (index >= 0) this.#waiters.splice(index, 1);
      }
      return null;
    }
    if (timer !== undefined) clearTimeout(timer);
    return outcome;
  }

  close(): void {
    this.#closed = true;
    void this.#reader.cancel().catch(() => undefined);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`断言失败：${message}`);
}

interface Waiter {
  resolve: (payload: Payload | null) => void;
  done: boolean;
}

function botSeats(payload: Payload): SeatInfo[] {
  return payload.table.seats.filter((seat) => seat.bot);
}

/**
 * 发牌。**容忍**「当前牌局尚未结束 / 还差 N 人」：那说明别人已经发了或人没到齐，
 * 不是这个脚本的错误 —— 让它继续读局面，而不是当场炸掉。
 */
async function ensureDeal(code: string, credential: string): Promise<void> {
  const attempt = await tryApi(
    `/api/tables/${code}/action`,
    { method: 'POST', body: JSON.stringify({ action: { type: 'deal' } }) },
    credential
  );
  const tolerated = attempt.message.includes('尚未结束') || attempt.message.includes('还差');
  if (attempt.status !== 200 && !tolerated) {
    throw new Error(`发牌失败：${attempt.status} ${attempt.message}`);
  }
}

/** 打完当前这一副：SSE 推帧驱动，人类座位用策略出手；返回结算后的负载 */
async function playDealToScore(
  code: string,
  credential: string,
  stream: Stream,
  label: string
): Promise<Payload> {
  const deadline = Date.now() + DEAL_TIMEOUT_MS;
  let payload = await payloadOf(code, credential);
  let humanMoves = 0;

  while (Date.now() < deadline) {
    const deal = payload.view?.deal ?? null;
    if (deal !== null && deal.phase === 'scored') {
      console.log(`${label} 结算完成（第 ${deal.summary?.dealNo} 副，最终分 ${deal.summary?.finalScore}）`);
      return payload;
    }
    if (deal === null) {
      await ensureDeal(code, credential);
      payload = await payloadOf(code, credential);
      continue;
    }
    const move = humanMove(payload);
    if (move !== null) {
      await api(`/api/tables/${code}/action`, { method: 'POST', body: JSON.stringify({ action: toAction(move) }) }, credential);
      humanMoves += 1;
      payload = await payloadOf(code, credential);
      continue;
    }
    // 不归人类动：等服务器推下一帧（机器人出手后会推）。
    // **只接受不比当前更旧的帧**：连接时那一帧（还没发牌、view 为 null）会排在队列里，
    // 拿它当现状就会误判成「还没发牌」，然后又去发一次（服务端 400「尚未结束」，踩过）。
    const pushed = await stream.next(SSE_READ_TIMEOUT_MS);
    if (pushed !== null && (pushed.view?.version ?? -1) >= (payload.view?.version ?? -1)) {
      payload = pushed;
    } else {
      payload = await payloadOf(code, credential);
    }
  }
  throw new Error(`${label} 超时（${DEAL_TIMEOUT_MS}ms）未结算；人类出手 ${humanMoves} 次`);
}

async function main(): Promise<void> {
  const stamp = Date.now() % 100000;
  const me = (await api('/api/auth/claim', {
    method: 'POST',
    body: JSON.stringify({ name: `机器人校验${stamp}` })
  })) as { name: string; credential: string };
  const outsider = (await api('/api/auth/claim', {
    method: 'POST',
    body: JSON.stringify({ name: `围观${stamp}` })
  })) as { name: string; credential: string };
  const created = (await api('/api/tables', { method: 'POST' }, me.credential)) as { code: string };
  const code = created.code;
  console.log(`同桌 ${code} 已开（身份 ${me.name}）`);

  // 越权：没入座的人不该能加机器人
  const refused = await tryApi(`/api/tables/${code}/bot`, { method: 'POST' }, outsider.credential);
  assert(refused.status === 400 && refused.message.includes('入座'), `未入座者加机器人应被拒，实际 ${refused.status} ${refused.message}`);
  console.log('越权守卫：未入座者加机器人被拒（400）');

  // 加两个机器人 → 满座
  const added: { seat: number; name: string }[] = [];
  for (let i = 0; i < 2; i++) {
    added.push((await api(`/api/tables/${code}/bot`, { method: 'POST' }, me.credential)) as { seat: number; name: string });
  }
  assert(added.every((bot) => bot.name.startsWith('机器人·')), `机器人名字应带前缀：${added.map((b) => b.name).join(',')}`);
  console.log(`已加机器人：${added.map((bot) => `${bot.name}(座位 ${bot.seat})`).join('、')}`);

  let payload = await payloadOf(code, me.credential);
  assert(payload.table.ready, '满座后 ready 应为 true');
  assert(botSeats(payload).length === 2, 'table.seats 里应有 2 个 bot=true');
  assert(payload.table.seats.every((seat) => seat.bot === (seat.name?.startsWith('机器人·') ?? false)), 'bot 标记应与名字一致');
  console.log(`有线形状：${payload.table.seats.map((s) => `${s.name}${s.bot ? '[机器人]' : ''}`).join(' / ')}`);

  // 第三个机器人应被上限挡住
  const overflow = await tryApi(`/api/tables/${code}/bot`, { method: 'POST' }, me.credential);
  assert(overflow.status === 400, `超过上限加机器人应被拒，实际 ${overflow.status}`);
  console.log('上限守卫：第 3 个机器人被拒（400）');

  const stream = await Stream.open(code, me.credential);
  try {
    console.log('SSE 已连接，开始第一副（人类座位也由同一份策略出手）');
    payload = await playDealToScore(code, me.credential, stream, '第 1 副');
    assert(payload.view?.deal?.summary !== null, '结算后应有 summary');

    // 第二副：开局后踢掉一个机器人 → 牌局停在空座；补回来 → 继续打完
    await ensureDeal(code, me.credential);
    payload = await payloadOf(code, me.credential);
    const target = botSeats(payload)[0]!;
    await api(`/api/tables/${code}/bot?seat=${target.seat}`, { method: 'DELETE' }, me.credential);
    payload = await payloadOf(code, me.credential);
    assert(payload.table.seats[target.seat]!.userId === null, `踢出后座位 ${target.seat} 应空出`);
    assert(payload.table.seats[target.seat]!.bot === false, '空座上的 bot 标记应清掉');
    console.log(`已请离 ${target.name}：座位 ${target.seat} 空出，本副应停在空座上`);

    await sleep(2500);
    payload = await payloadOf(code, me.credential);
    assert(
      payload.view?.deal?.phase !== 'scored',
      '空座上没人，本副不该自己打完（离座语义：停在空座等补位）'
    );
    console.log('离座语义：本副确实停在空座上（未结算）');

    const replaced = (await api(`/api/tables/${code}/bot`, { method: 'POST' }, me.credential)) as {
      seat: number;
      name: string;
    };
    assert(replaced.seat === target.seat, `补位的机器人应坐回座位 ${target.seat}，实际 ${replaced.seat}`);
    console.log(`已补位 ${replaced.name}（座位 ${replaced.seat}），继续打完`);

    payload = await playDealToScore(code, me.credential, stream, '第 2 副');
    console.log(`完成：两副都打完了（请求数 ${requests}）`);
  } finally {
    stream.close();
  }
}

await main();
