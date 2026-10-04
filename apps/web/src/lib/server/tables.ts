import { randomInt } from 'node:crypto';
import {
  createGame,
  dispatch,
  type Action,
  type BidCall,
  type Card,
  type GameState,
  type Seat
} from '@sixty/engine';
import type { Role, SeatInfo, StreamPayload, TableView } from '$lib/shared';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from '$lib/invite';
import { projectionFor, resolveArrivalRole } from '$lib/role';
import { db, now, transaction } from './db';
import { broadcast, connectionUserIds, isRecentlyActive, isUserOnline, touch } from './hub';

export interface TableInfo {
  readonly id: number;
  readonly code: string;
  readonly hostUserId: number;
  /** 按座位号排列的 user_id，空座为 null */
  readonly seats: readonly (number | null)[];
}

interface TableRow {
  id: number;
  code: string;
  host_user_id: number;
}

interface SeatRow {
  seat: number;
  user_id: number;
  name: string;
}

const cryptoRng = (): number => randomInt(0, 2 ** 32) / 2 ** 32;
const SEAT_COUNT = 3;

function makeCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += INVITE_CODE_ALPHABET[randomInt(0, INVITE_CODE_ALPHABET.length)];
    const exists = db.prepare('SELECT 1 FROM tables WHERE code = ?').get(code);
    if (!exists) return code;
  }
  throw new Error('无法生成邀请码');
}

function readSeats(tableId: number): (number | null)[] {
  const rows = db
    .prepare('SELECT seat, user_id FROM seats WHERE table_id = ? ORDER BY seat')
    .all(tableId) as unknown as { seat: number; user_id: number }[];
  const seats: (number | null)[] = [null, null, null];
  for (const row of rows) seats[row.seat] = row.user_id;
  return seats;
}

function tableFrom(row: TableRow): TableInfo {
  return { id: row.id, code: row.code, hostUserId: row.host_user_id, seats: readSeats(row.id) };
}

function freeSeatOf(table: TableInfo): number {
  return table.seats.findIndex((id) => id === null);
}

export function createTable(userId: number): TableInfo {
  const code = makeCode();
  const info = db
    .prepare('INSERT INTO tables (code, host_user_id, created_at) VALUES (?, ?, ?)')
    .run(code, userId, now());
  const tableId = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO seats (table_id, seat, user_id, joined_at) VALUES (?, 0, ?, ?)').run(
    tableId,
    userId,
    now()
  );
  return { id: tableId, code, hostUserId: userId, seats: [userId, null, null] };
}

export function getTableByCode(code: string): TableInfo | null {
  const row = db
    .prepare('SELECT id, code, host_user_id FROM tables WHERE code = ?')
    .get(code.toUpperCase()) as TableRow | undefined;
  return row ? tableFrom(row) : null;
}

export interface MyTable {
  readonly code: string;
  readonly seated: number;
  readonly role: Role;
}

/** 大厅列表：我占着座位的桌 + 我在观战的桌（离座后仍然回得去，不必重新找链接） */
export function myTables(userId: number): MyTable[] {
  const rows = db
    .prepare(
      `SELECT t.code AS code,
              (SELECT COUNT(*) FROM seats s2 WHERE s2.table_id = t.id) AS seated,
              (s.user_id IS NOT NULL) AS seated_me
       FROM tables t
       LEFT JOIN seats s ON s.table_id = t.id AND s.user_id = ?
       LEFT JOIN spectators w ON w.table_id = t.id AND w.user_id = ?
       WHERE s.user_id IS NOT NULL OR w.user_id IS NOT NULL
       ORDER BY t.id DESC
       LIMIT 20`
    )
    .all(userId, userId) as unknown as { code: string; seated: number; seated_me: number }[];
  return rows.map((row) => ({
    code: row.code,
    seated: row.seated,
    role: row.seated_me === 1 ? 'player' : 'spectator'
  }));
}

export function seatOf(table: TableInfo, userId: number): number | null {
  const index = table.seats.findIndex((id) => id === userId);
  return index === -1 ? null : index;
}

/**
 * 该身份出现在哪些桌（占着座位，或留着观战记录）。
 *
 * 「在线」是**身份级**的判定（`hub` 里按 userId 存），所以一个人刚上线这件事要在他出现的
 * **每一张**桌都推一帧 —— 在 A 桌坐着、拿 B 桌的码轮询的 agent，不该在 A 桌一直显示离线。
 * 不改 `myTables` 的返回形状来做这件事：那份形状有浏览器消费者（等于 wire 形状）。
 */
function tableIdsOf(userId: number): number[] {
  const rows = db
    .prepare(
      `SELECT t.id AS id FROM tables t
       LEFT JOIN seats s ON s.table_id = t.id AND s.user_id = ?
       LEFT JOIN spectators w ON w.table_id = t.id AND w.user_id = ?
       WHERE s.user_id IS NOT NULL OR w.user_id IS NOT NULL`
    )
    .all(userId, userId) as unknown as { id: number }[];
  return rows.map((row) => row.id);
}

/** 这个身份刚上线：通知他出现的每一张桌（见 hub.ts 的 `touch`） */
function announce(userId: number): void {
  for (const id of tableIdsOf(userId)) broadcast(id);
}

/**
 * 记一次活跃，并在「离线→在线」翻转时通知各桌。
 *
 * 每个请求都推是不行的（`wait_for_turn` 每 1.5 秒读一次局面），所以这里只认翻转 ——
 * 一个窗口内每个身份至多一次。
 */
function touched(userId: number): void {
  if (touch(userId)) announce(userId);
}

/** 该身份是否还占着任何一张桌的座位（改名/换身份的前提，见 ADR-0009） */
export function seatedTableCode(userId: number): string | null {
  const row = db
    .prepare(
      `SELECT t.code AS code FROM seats s JOIN tables t ON t.id = s.table_id
       WHERE s.user_id = ? LIMIT 1`
    )
    .get(userId) as { code: string } | undefined;
  return row?.code ?? null;
}

export function watchingOf(tableId: number, userId: number): boolean {
  const row = db
    .prepare('SELECT 1 FROM spectators WHERE table_id = ? AND user_id = ?')
    .get(tableId, userId);
  return row !== undefined;
}

export function addWatcher(tableId: number, userId: number): void {
  db.prepare('INSERT OR IGNORE INTO spectators (table_id, user_id, joined_at) VALUES (?, ?, ?)').run(
    tableId,
    userId,
    now()
  );
}

export type EnterResult =
  | { readonly role: 'player'; readonly table: TableInfo; readonly seat: number; readonly inherited: boolean }
  | { readonly role: 'spectator'; readonly table: TableInfo }
  | { readonly error: string };

/**
 * 此刻是否有一副正在进行（结算前）。
 *
 * 入座时它为真 ⇒ 你接下的是**别人的牌局进度**（该座位的手牌与级别），需要告知一声：
 * 否则新来的人会莫名其妙拿着一手陌生的牌、还不知道轮到自己要出什么。
 */
function dealInProgress(tableId: number): boolean {
  const state = getGameState(tableId);
  return state !== null && state.deal !== null && state.deal.phase !== 'scored';
}

/**
 * 到达一张同桌（点邀请码/邀请链接、或大厅「加入」）：
 * 已在座 → 玩家；有观战记录 → 观战（刷新不会被自动塞回座位）；有空座 → 自动入座；满座 → 观战。
 * 规则本身在 `resolveArrivalRole` 里，有单测；这里只做数据库动作。
 *
 * **变更之后要广播**（见 ADR-0012）：浏览器玩家随后必然连上 SSE，而 `stream` 在连接时会广播一次，
 * 于是「入座」过去总是顺带把别人的屏幕刷新了 —— 那个隐含前提对 MCP 座位不成立（它没有 SSE），
 * 所以人类屏幕上会一直显示「还差 1 人」、按钮一直是灰的，直到有人先出一次牌。
 */
export function enterTable(code: string, userId: number): EnterResult {
  const table = getTableByCode(code);
  if (table === null) return { error: '同桌不存在' };
  const seat = seatOf(table, userId);
  // 已经在座：什么都没变，不广播（重复 join_table 不该产生帧）
  if (seat !== null) return { role: 'player', table, seat, inherited: false };

  const freeSeats = table.seats.filter((id) => id === null).length;
  const watching = watchingOf(table.id, userId);
  const role = resolveArrivalRole({ seated: false, watching, freeSeats });
  if (role === 'player') {
    const free = freeSeatOf(table);
    db.prepare('INSERT INTO seats (table_id, seat, user_id, joined_at) VALUES (?, ?, ?, ?)').run(
      table.id,
      free,
      userId,
      now()
    );
    broadcast(table.id);
    return { role: 'player', table: getTableByCode(code)!, seat: free, inherited: dealInProgress(table.id) };
  }

  addWatcher(table.id, userId);
  // 观战记录已经在了就连记录都没变，没必要推
  if (!watching) broadcast(table.id);
  return { role: 'spectator', table };
}

export type ActionResult = { ok: true } | { ok: false; message: string };

/** 离座：座位空出，本人转为观战者（写完观战记录后刷新也不会被自动塞回座位） */
export function leaveSeat(code: string, userId: number): ActionResult {
  const table = getTableByCode(code);
  if (table === null) return { ok: false, message: '同桌不存在' };
  if (seatOf(table, userId) === null) {
    // 幂等：本来就没在座，只确保观战意愿记下（按钮双击/重试不该报错）
    const watching = watchingOf(table.id, userId);
    addWatcher(table.id, userId);
    if (!watching) broadcast(table.id);
    return { ok: true };
  }
  transaction(() => {
    db.prepare('DELETE FROM seats WHERE table_id = ? AND user_id = ?').run(table.id, userId);
    db.prepare('INSERT OR IGNORE INTO spectators (table_id, user_id, joined_at) VALUES (?, ?, ?)').run(
      table.id,
      userId,
      now()
    );
  });
  broadcast(table.id);
  return { ok: true };
}

/** 入座（观战者的「入座」按钮，也是大厅进入满座桌后的补位入口） */
export function takeSeat(
  code: string,
  userId: number
): { seat: number; inherited: boolean } | { error: string } {
  const table = getTableByCode(code);
  if (table === null) return { error: '同桌不存在' };
  const existing = seatOf(table, userId);
  // 已经在座：幂等，没有变化
  if (existing !== null) return { seat: existing, inherited: false };
  const free = freeSeatOf(table);
  if (free === -1) return { error: `座位已满（${SEAT_COUNT} 人），等有人离座` };
  const result = transaction(() => {
    db.prepare('DELETE FROM spectators WHERE table_id = ? AND user_id = ?').run(table.id, userId);
    db.prepare('INSERT INTO seats (table_id, seat, user_id, joined_at) VALUES (?, ?, ?, ?)').run(
      table.id,
      free,
      userId,
      now()
    );
    return { seat: free, inherited: dealInProgress(table.id) };
  });
  broadcast(table.id);
  return result;
}

export function tableView(table: TableInfo): TableView {
  const rows = db
    .prepare(
      `SELECT s.seat AS seat, s.user_id AS user_id, u.name AS name
       FROM seats s JOIN users u ON u.id = s.user_id
       WHERE s.table_id = ? ORDER BY s.seat`
    )
    .all(table.id) as unknown as SeatRow[];
  const bySeat = new Map<number, SeatRow>();
  for (const row of rows) bySeat.set(row.seat, row);
  const seats: SeatInfo[] = [0, 1, 2].map((seat) => {
    const row = bySeat.get(seat);
    return {
      seat,
      userId: row?.user_id ?? null,
      name: row?.name ?? null,
      // 「在线」= 有 SSE 订阅，或最近有请求（MCP 侧没有 SSE，只能靠请求说话，见 hub.ts）
      online: row ? isUserOnline(table.id, row.user_id) || isRecentlyActive(row.user_id) : false
    };
  });
  const seatedCount = seats.filter((s) => s.userId !== null).length;
  // 「N 人观战」= 连着的 SSE 里不属于任何座位的**不同身份**数（实时口径，不是 spectators 记录数）
  const seatedIds = new Set(table.seats.filter((id): id is number => id !== null));
  const spectators = new Set(connectionUserIds(table.id).filter((id) => !seatedIds.has(id)));
  return {
    code: table.code,
    seats,
    seatedCount,
    ready: seatedCount === SEAT_COUNT,
    spectatorCount: spectators.size
  };
}

export function getGameState(tableId: number): GameState | null {
  const row = db.prepare('SELECT state FROM games WHERE table_id = ?').get(tableId) as
    | { state: string }
    | undefined;
  return row ? (JSON.parse(row.state) as GameState) : null;
}

function saveGame(tableId: number, state: GameState): void {
  db.prepare(
    `INSERT INTO games (table_id, state, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(table_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
  ).run(tableId, JSON.stringify(state), now());
}

function appendEvents(tableId: number, events: readonly { type: string }[]): void {
  if (events.length === 0) return;
  const maxRow = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE table_id = ?').get(
    tableId
  ) as { seq: number };
  let seq = maxRow.seq;
  const stmt = db.prepare(
    'INSERT INTO events (table_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const event of events) {
    seq += 1;
    stmt.run(tableId, seq, event.type, JSON.stringify(event), now());
  }
}

/**
 * 该用户此刻该收到的完整负载：角色、公共/个人视图、自己那份手牌、桌面信息。
 * 角色每次按数据库现算，绝不接受客户端传入（观战者无法自称玩家）。
 */
export function payloadFor(table: TableInfo, userId: number): StreamPayload {
  // 读到自己的负载就算「最近活跃」：MCP 侧没有 SSE，靠这个让座位卡不显示假离线（见 ADR-0010）。
  // 翻转时顺手广播：别人的屏幕上那颗点该变绿了 —— 不然它要等到下一次动作才更新（见 ADR-0012）。
  touched(userId);
  const seat = seatOf(table, userId);
  return {
    ...projectionFor(getGameState(table.id), seat === null ? null : (seat as Seat)),
    table: tableView(table)
  };
}

/** 服务器权威地执行一个动作：座位号一律由服务端根据身份推导（见 ADR-0002） */
export function applyTableAction(code: string, userId: number, action: Action): ActionResult {
  const table = getTableByCode(code);
  if (table === null) return { ok: false, message: '同桌不存在' };
  const seat = seatOf(table, userId);
  // 一次动作也是「最近活跃」：失败的动作同样说明这个人此刻在场（见 ADR-0010）
  touched(userId);
  if (seat === null) return { ok: false, message: '你在观战，入座后才能操作' };

  const seated = table.seats.filter((id) => id !== null).length;
  let state = getGameState(table.id);

  // 发牌与开新对局都要求三人到齐：座位可能被离座腾空，不能只在首副校验
  if (action.type === 'deal' || action.type === 'newGame') {
    if (seated < SEAT_COUNT) return { ok: false, message: `还差 ${SEAT_COUNT - seated} 人才能开始` };
  }

  if (state === null) {
    if (action.type !== 'deal') return { ok: false, message: '三人到齐后由任意一人发牌' };
    state = createGame(randomInt(0, SEAT_COUNT) as Seat);
  }

  const serverAction: Action =
    action.type === 'bid' || action.type === 'bury' || action.type === 'play'
      ? { ...action, seat: seat as Seat }
      : action;

  const result = dispatch(state, serverAction, cryptoRng);
  if (!result.ok) return { ok: false, message: result.message };

  transaction(() => {
    saveGame(table.id, result.state);
    appendEvents(table.id, result.events);
  });
  broadcast(table.id);
  return { ok: true };
}

export function isCardShape(value: unknown): value is Card {
  if (typeof value !== 'object' || value === null) return false;
  const card = value as { suit?: unknown; rank?: unknown; joker?: unknown };
  if (card.joker === 'small' || card.joker === 'big') return true;
  return (
    (card.suit === 'C' || card.suit === 'D' || card.suit === 'H' || card.suit === 'S') &&
    typeof card.rank === 'number' &&
    Number.isInteger(card.rank) &&
    card.rank >= 2 &&
    card.rank <= 14
  );
}

export function isCallShape(value: unknown): value is BidCall {
  if (value === 'pass') return true;
  if (typeof value !== 'object' || value === null) return false;
  const call = value as { points?: unknown; strain?: unknown };
  return (
    typeof call.points === 'number' &&
    Number.isInteger(call.points) &&
    (call.strain === 'C' || call.strain === 'D' || call.strain === 'H' || call.strain === 'S' || call.strain === 'NT')
  );
}
