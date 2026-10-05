import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * 单文件 SQLite（better-sqlite3 的替代：Node 内置 node:sqlite，无原生编译步骤）。
 * 持久化引擎完整状态 JSON + 追加事件表，重启后可无缝续局（见 ADR-0002）。
 */
const dbPath = process.env['SIXTY_DB'] ?? resolve(process.cwd(), 'data/sixty.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_bot INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  host_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seats (
  table_id INTEGER NOT NULL REFERENCES tables(id),
  seat INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (table_id, seat),
  UNIQUE (table_id, user_id)
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER NOT NULL UNIQUE REFERENCES tables(id),
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- 观战记录：不是「正在看」，而是「这个人对这张桌表达过不坐座位」（满座到达或主动离座）。
-- 它的唯一作用是让同桌页不再把这位用户自动塞回座位（见 ADR-0007 / role.ts）。
CREATE TABLE IF NOT EXISTS spectators (
  table_id INTEGER NOT NULL REFERENCES tables(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (table_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_spectators_user ON spectators (user_id);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER NOT NULL REFERENCES tables(id),
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_table ON events (table_id, seq);
-- 机器重演（ADR-0016）：每副结算时同步算好、只读不回写、不再重算。
-- 键是 (table_id, deal_no)；开新对局时 dealNo 从 1 重新计数，所以那张事务里整表清空。
CREATE TABLE IF NOT EXISTS replays (
  table_id INTEGER NOT NULL REFERENCES tables(id),
  deal_no INTEGER NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (table_id, deal_no)
);
`);

// 机器人座位（ADR-0015）：老库补列。上面的 CREATE TABLE 只对新建库生效，
// 已有的 users 表要靠探测 + ALTER，否则一升级就崩。
{
  const columns = db.prepare('PRAGMA table_info(users)').all() as unknown as { name: string }[];
  if (!columns.some((col) => col.name === 'is_bot')) {
    db.exec('ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0');
  }
}

export function now(): string {
  return new Date().toISOString();
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export const DB_FILE = dbPath;
