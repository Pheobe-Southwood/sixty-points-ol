/**
 * 机器人座位的服务端实现（ADR-0014）：无令牌特殊身份 + 进程内代打。
 *
 * 信息面与动作面各只有一条路：
 * - **看**：`viewFor`（浏览器 / MCP 同款的个人视图投影）—— 机器人拿不到别人的手牌与底牌，
 *   不是靠自律，是这里没有别的路（`apps/web/test/bot-guard.test.ts` 静态钉死）；
 * - **动**：`applyTableAction`（与 REST / MCP 同一条服务器权威路径），动作自然记「最近活跃」，
 *   在线点如实亮，停手一个窗口后转灰。
 *
 * 调度不依赖内存队列：每次状态变更后 `scheduleBots` 重判一轮（幂等，没轮到就什么都不排），
 * 服务启动时 `initBots` 全量补扫 —— 重启后机器人回合自动续上。
 */
import { randomBytes, randomInt } from 'node:crypto';
import { type Action } from '@sixty/engine';
import { fallbackFor, moveFor, type BotMove } from '@sixty/bot';
import { db, now, transaction } from './db';
import { broadcast } from './hub';
import { applyTableAction, getTableByCode, getTableById, seatOf, viewFor } from './tables';
import { BOT_LIMIT } from '../shared';

export { BOT_LIMIT };

const BOT_NAME_POOL = ['小六', '小七', '小八', '小九', '小十'] as const;

/** 拟人延迟（毫秒）：测试把它调零换确定性；上限不低于下限 */
const DELAY_MIN_MS = Math.max(0, Number(process.env['SIXTY_BOT_DELAY_MIN_MS'] ?? 500));
const DELAY_MAX_MS = Math.max(DELAY_MIN_MS, Number(process.env['SIXTY_BOT_DELAY_MAX_MS'] ?? 1500));

interface BotSeatRow {
  readonly seat: number;
  readonly user_id: number;
}

/** 这张桌上所有机器人座位（按座位号） */
export function botSeats(tableId: number): BotSeatRow[] {
  return db
    .prepare(
      `SELECT s.seat AS seat, s.user_id AS user_id
       FROM seats s JOIN users u ON u.id = s.user_id
       WHERE s.table_id = ? AND u.is_bot = 1
       ORDER BY s.seat`
    )
    .all(tableId) as unknown as BotSeatRow[];
}

/** 取一个全局未占用的机器人名：池子用尽则序号顺延（与 makeCode 同一套重试思路） */
function unusedBotName(): string {
  for (const base of BOT_NAME_POOL) {
    const name = `机器人·${base}`;
    if (db.prepare('SELECT 1 FROM users WHERE name = ?').get(name) === undefined) return name;
  }
  for (const base of BOT_NAME_POOL) {
    for (let n = 2; n < 100; n++) {
      const name = `机器人·${base}${n}`;
      if (db.prepare('SELECT 1 FROM users WHERE name = ?').get(name) === undefined) return name;
    }
  }
  throw new Error('机器人名字池耗尽');
}

/** 建一个机器人身份：有 token（列非空）但**永不外发**，且认证路径排除 is_bot 行 —— 没有凭据串这回事 */
function createBotIdentity(): { id: number; name: string } {
  const name = unusedBotName();
  const info = db
    .prepare('INSERT INTO users (name, token, created_at, is_bot) VALUES (?, ?, ?, 1)')
    .run(name, randomBytes(24).toString('base64url'), now());
  return { id: Number(info.lastInsertRowid), name };
}

export type BotResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/**
 * 加一个机器人：占第一个空座（进行中加入＝**补位**，接手该座位的手牌与级别）。
 * 只有**在座的人类**能加（观战者不能改桌面构成）；上限 `BOT_LIMIT`。
 */
export function addBot(code: string, actorId: number): BotResult<{ seat: number; name: string }> {
  const table = getTableByCode(code);
  if (table === null) return { ok: false, error: '同桌不存在' };
  if (seatOf(table, actorId) === null) return { ok: false, error: '加机器人需要你先入座' };
  if (botSeats(table.id).length >= BOT_LIMIT) {
    return { ok: false, error: `机器人至多 ${BOT_LIMIT} 个（至少留一个人类座位按「开下一副」）` };
  }
  const free = table.seats.findIndex((id) => id === null);
  if (free === -1) return { ok: false, error: '座位已满，等有人离座' };

  const { id, name } = createBotIdentity();
  transaction(() => {
    db.prepare('INSERT INTO seats (table_id, seat, user_id, joined_at) VALUES (?, ?, ?, ?)').run(
      table.id,
      free,
      id,
      now()
    );
  });
  broadcast(table.id);
  // 正打着且立刻轮到它（补位进机器人回合）：让它开始想
  scheduleBots(table.id);
  return { ok: true, value: { seat: free, name } };
}

/**
 * 移出机器人＝**离座**语义：座位空出、进行中的这一副停在空座上等补位。
 * 机器人身份随之删除（名字回收可复用）；它不是观战者，不写观战记录。
 */
export function removeBot(code: string, actorId: number, seat: number): BotResult<null> {
  const table = getTableByCode(code);
  if (table === null) return { ok: false, error: '同桌不存在' };
  if (seatOf(table, actorId) === null) return { ok: false, error: '移出机器人需要你先入座' };
  const target = botSeats(table.id).find((row) => row.seat === seat);
  if (target === undefined) return { ok: false, error: '那个座位上不是机器人' };

  transaction(() => {
    db.prepare('DELETE FROM seats WHERE table_id = ? AND seat = ?').run(table.id, seat);
    db.prepare('DELETE FROM spectators WHERE table_id = ? AND user_id = ?').run(table.id, target.user_id);
    db.prepare('DELETE FROM users WHERE id = ? AND is_bot = 1').run(target.user_id);
  });
  clearTimer(table.id, target.user_id);
  broadcast(table.id);
  return { ok: true, value: null };
}

// ---------------------------------------------------------------------------
// 调度器：状态变更后重判（幂等）；启动时全量补扫。不依赖内存队列存活。
// ---------------------------------------------------------------------------

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** 测试用：是否已无待触发的机器人动作 */
export function botsIdle(): boolean {
  return timers.size === 0;
}

/**
 * 丢掉进程内的全部排程 —— 等价于「调度器重启后的空状态」。
 *
 * 正常路径不需要它（`initBots` 在启动时补扫）；它的存在是为了让「重启自愈」这件事
 * **可被测试**：先丢掉排程，再调 `initBots`，牌局必须能继续推进（见 bots.test.ts）。
 */
export function forgetBotTimers(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

function clearTimer(tableId: number, userId: number): void {
  const key = `${tableId}:${userId}`;
  const existing = timers.get(key);
  if (existing !== undefined) {
    clearTimeout(existing);
    timers.delete(key);
  }
}

/**
 * 每次状态变更后调用：轮到哪个机器人，就给它排一个拟人延迟的动作。
 * 已有排程则重置（状态变了，旧延迟作废）——每桌每机器人至多一个在途定时器。
 */
export function scheduleBots(tableId: number): void {
  const table = getTableById(tableId);
  if (table === null) return;
  for (const { user_id: userId } of botSeats(tableId)) {
    if (seatOf(table, userId) === null) continue; // 竞态兜底：座位已没了
    const payload = viewFor(table, userId);
    if (moveFor(payload.view, payload.you) === null) continue; // 不归它动
    const key = `${tableId}:${userId}`;
    const existing = timers.get(key);
    if (existing !== undefined) clearTimeout(existing);
    const delay = DELAY_MIN_MS + randomInt(0, DELAY_MAX_MS - DELAY_MIN_MS + 1);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        actAsBot(tableId, userId);
      }, delay)
    );
  }
}

function toAction(move: BotMove): Action {
  // 座位号由 applyTableAction 按身份覆盖（ADR-0002），这里只是满足引擎类型
  switch (move.type) {
    case 'bid':
      return { type: 'bid', seat: 0, call: move.call };
    case 'bury':
      return { type: 'bury', seat: 0, cards: move.cards };
    case 'play':
      return { type: 'play', seat: 0, cards: move.cards };
  }
}

/** 定时器到点：重读现状（定时器可能已悬空），出牌走同一条权威路径；被拒不卡桌面 */
function actAsBot(tableId: number, userId: number): void {
  const table = getTableById(tableId);
  if (table === null) return;
  const seat = seatOf(table, userId);
  if (seat === null) return; // 已被移出
  const payload = viewFor(table, userId);
  const move = moveFor(payload.view, payload.you);
  if (move === null) return; // 已不轮到它

  let result = applyTableAction(table.code, userId, toAction(move));
  if (!result.ok) {
    // 策略与引擎漂移（理论不该发生）：退回保底合法动作，桌面绝不卡在机器人手里
    const fallback = fallbackFor(payload.view, payload.you);
    console.error(
      `机器人动作被拒（桌 ${table.code} 座位 ${seat}，${move.type}）：${result.message}` +
        (fallback === null ? '；且给不出保底动作' : '；退回保底动作')
    );
    if (fallback !== null) {
      result = applyTableAction(table.code, userId, toAction(fallback));
      if (!result.ok) console.error(`保底动作也被拒（桌 ${table.code} 座位 ${seat}）：${result.message}`);
    }
  }
}

/** 服务启动时补扫：重启前挂着的机器人回合自动续上（内存定时器不跨进程存活） */
export function initBots(): void {
  const rows = db
    .prepare(
      `SELECT DISTINCT s.table_id AS table_id
       FROM seats s JOIN users u ON u.id = s.user_id
       WHERE u.is_bot = 1`
    )
    .all() as unknown as { table_id: number }[];
  for (const row of rows) scheduleBots(row.table_id);
}
