import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { db, now } from './db';

export const CREDENTIAL_COOKIE = 'sixty_cred';
const NAME_MAX = 12;

export interface Identity {
  readonly id: number;
  readonly name: string;
  readonly token: string;
}

interface UserRow {
  id: number;
  name: string;
  token: string;
}

/** 凭据串 = base64url(名字:令牌)，可复制粘贴跨浏览器（见 ADR-0003） */
export function credentialOf(user: Identity): string {
  return Buffer.from(`${user.name}:${user.token}`, 'utf8').toString('base64url');
}

export function parseCredential(credential: string): { name: string; token: string } | null {
  try {
    const raw = Buffer.from(credential.trim(), 'base64url').toString('utf8');
    const sep = raw.indexOf(':');
    if (sep <= 0 || sep === raw.length - 1) return null;
    return { name: raw.slice(0, sep), token: raw.slice(sep + 1) };
  } catch {
    return null;
  }
}

export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (name.length === 0 || name.length > NAME_MAX) return null;
  if (name.includes(':')) return null;
  return name;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * 按名字查身份：**含机器人**（名字全局唯一，注册/改名的撞名检查必须把它们算进去）。
 */
export function findByName(name: string): Identity | null {
  const row = db.prepare('SELECT id, name, token FROM users WHERE name = ?').get(name) as
    | UserRow
    | undefined;
  return row ?? null;
}

/** 按名字查**可登录**的身份：机器人行被排除（ADR-0015 —— 机器人没有凭据串，也不许有） */
function findAuthByName(name: string): Identity | null {
  const row = db.prepare('SELECT id, name, token FROM users WHERE name = ? AND is_bot = 0').get(
    name
  ) as UserRow | undefined;
  return row ?? null;
}

/**
 * 注册新身份；**名字已被占用时返回 null**（不返回那条身份）。
 *
 * 曾经这里对已存在的名字直接返回既有身份，于是「输入别人的名字」就等于登入别人，
 * 拿到的正是对方座位上的手牌。名字唯一 + 令牌才是凭证（ADR-0003 / ADR-0009）。
 */
export function createIdentity(name: string): Identity | null {
  if (findByName(name) !== null) return null;
  const token = randomBytes(24).toString('base64url');
  const info = db
    .prepare('INSERT INTO users (name, token, created_at) VALUES (?, ?, ?)')
    .run(name, token, now());
  return { id: Number(info.lastInsertRowid), name, token };
}

export function findByCredential(credential: string): Identity | null {
  const parsed = parseCredential(credential);
  if (parsed === null) return null;
  // 机器人行在此被排除：就算拿到了它的令牌也登不进来（防御纵深，令牌本就不外发）
  const row = findAuthByName(parsed.name);
  if (!row) return null;
  return safeEqual(row.token, parsed.token) ? row : null;
}

export function findByToken(token: string): Identity | null {
  const row = db.prepare('SELECT id, name, token FROM users WHERE token = ? AND is_bot = 0').get(token) as
    | UserRow
    | undefined;
  return row ?? null;
}

export function rename(identity: Identity, name: string): Identity {
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, identity.id);
  return { ...identity, name };
}

export function setCredentialCookie(cookies: Cookies, credential: string): void {
  cookies.set(CREDENTIAL_COOKIE, credential, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  });
}

export function clearCredentialCookie(cookies: Cookies): void {
  cookies.delete(CREDENTIAL_COOKIE, { path: '/' });
}

/** 身份来源：cookie 优先，其次 Authorization: Bearer <凭据串> */
export function identityFrom(event: Pick<RequestEvent, 'cookies' | 'request'>): Identity | null {
  const cookie = event.cookies.get(CREDENTIAL_COOKIE);
  if (cookie) {
    const found = findByCredential(cookie);
    if (found) return found;
  }
  const header = event.request.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    const found = findByCredential(header.slice(7).trim());
    if (found) return found;
  }
  return null;
}

export function requireIdentity(event: Pick<RequestEvent, 'cookies' | 'request'>): Identity {
  const identity = identityFrom(event);
  if (identity === null) error(401, '需要身份：请先创建或导入凭据');
  return identity;
}

/**
 * 这个请求有没有**尝试**带凭据（cookie 或 `Authorization: Bearer`，非空）。
 *
 * 用途只有一个：把「**没带**凭据」与「带了但**无效**」分开。
 * `/api/mcp` 允许前者（无身份会话：只有 read_rules 与 claim，见 ADR-0014），
 * 但后者必须 401 —— 静默降级成匿名会让「凭据串粘错/已失效」看起来像「权限突然全没了」。
 * 有效性判定仍然只在 `identityFrom` 里（此处只看有没有带）。
 */
export function credentialPresent(event: Pick<RequestEvent, 'cookies' | 'request'>): boolean {
  const cookie = event.cookies.get(CREDENTIAL_COOKIE);
  if (cookie !== undefined && cookie.trim().length > 0) return true;
  const header = event.request.headers.get('authorization');
  if (header === null || !header.toLowerCase().startsWith('bearer ')) return false;
  return header.slice(7).trim().length > 0;
}
