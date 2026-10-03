import { randomInt } from 'node:crypto';
import {
  createGame,
  dispatch,
  personalView,
  type Action,
  type BidCall,
  type Card,
  type GameState,
  type PersonalView,
  type Seat
} from '@sixty/engine';
import type { SeatInfo, TableView } from '$lib/shared';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from '$lib/invite';
import { db, now, transaction } from './db';
import { broadcast, isUserOnline } from './hub';

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

export function tablesOf(userId: number): TableInfo[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.code, t.host_user_id FROM tables t
       JOIN seats s ON s.table_id = t.id
       WHERE s.user_id = ?
       ORDER BY t.id DESC
       LIMIT 20`
    )
    .all(userId) as unknown as TableRow[];
  return rows.map(tableFrom);
}

export function seatOf(table: TableInfo, userId: number): number | null {
  const index = table.seats.findIndex((id) => id === userId);
  return index === -1 ? null : index;
}

/** 入座：已在座则返回原座位；满座返回错误 */
export function joinTable(code: string, userId: number): { table: TableInfo; seat: number } | { error: string } {
  const table = getTableByCode(code);
  if (table === null) return { error: '同桌不存在' };
  const existing = seatOf(table, userId);
  if (existing !== null) return { table, seat: existing };
  const free = table.seats.findIndex((id) => id === null);
  if (free === -1) return { error: '该同桌已满（3 人）' };
  db.prepare('INSERT INTO seats (table_id, seat, user_id, joined_at) VALUES (?, ?, ?, ?)').run(
    table.id,
    free,
    userId,
    now()
  );
  return { table: getTableByCode(code)!, seat: free };
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
      online: row ? isUserOnline(table.id, row.user_id) : false
    };
  });
  const seatedCount = seats.filter((s) => s.userId !== null).length;
  return { code: table.code, seats, seatedCount, ready: seatedCount === 3 };
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

export function viewFor(tableId: number, userId: number): PersonalView | null {
  const table = db
    .prepare('SELECT id, code, host_user_id FROM tables WHERE id = ?')
    .get(tableId) as TableRow | undefined;
  if (!table) return null;
  const seat = seatOf(tableFrom(table), userId);
  if (seat === null) return null;
  const state = getGameState(tableId);
  if (state === null) return null;
  return personalView(state, seat as Seat);
}

export type ActionResult = { ok: true } | { ok: false; message: string };

/** 服务器权威地执行一个动作：座位号一律由服务端根据身份推导（见 ADR-0002） */
export function applyTableAction(code: string, userId: number, action: Action): ActionResult {
  const table = getTableByCode(code);
  if (table === null) return { ok: false, message: '同桌不存在' };
  const seat = seatOf(table, userId);
  if (seat === null) return { ok: false, message: '你不在该同桌的座位上' };

  const seated = table.seats.filter((id) => id !== null).length;
  let state = getGameState(table.id);

  if (state === null) {
    if (action.type !== 'deal') return { ok: false, message: '三人到齐后由任意一人发牌' };
    if (seated < 3) return { ok: false, message: `还差 ${3 - seated} 人才能开始` };
    state = createGame(randomInt(0, 3) as Seat);
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
