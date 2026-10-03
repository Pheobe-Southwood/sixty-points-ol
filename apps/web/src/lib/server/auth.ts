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

export function register(name: string): Identity {
  const existing = db.prepare('SELECT id, name, token FROM users WHERE name = ?').get(name) as
    | UserRow
    | undefined;
  if (existing) return existing;
  const token = randomBytes(24).toString('base64url');
  const info = db
    .prepare('INSERT INTO users (name, token, created_at) VALUES (?, ?, ?)')
    .run(name, token, now());
  return { id: Number(info.lastInsertRowid), name, token };
}

export function findByCredential(credential: string): Identity | null {
  const parsed = parseCredential(credential);
  if (parsed === null) return null;
  const row = db.prepare('SELECT id, name, token FROM users WHERE name = ?').get(parsed.name) as
    | UserRow
    | undefined;
  if (!row) return null;
  return safeEqual(row.token, parsed.token) ? row : null;
}

export function findByToken(token: string): Identity | null {
  const row = db.prepare('SELECT id, name, token FROM users WHERE token = ?').get(token) as
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
