/**
 * 邀请码 / 邀请链接的解析与生成（纯函数，服务端与客户端共用）。
 *
 * 字母表与长度是服务端生成逻辑的单一事实来源：`$lib/server/tables` 从这里 import，
 * 避免「生成用一套、解析用一套」悄悄漂移。
 */

export const INVITE_CODE_LENGTH = 6;
/** 去掉易混的 I O 0 1 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const LETTERS: ReadonlySet<string> = new Set(INVITE_CODE_ALPHABET);

/** 6 位且每个字符都在字母表内（大小写不敏感）→ 归一化为大写，否则 null */
export function normalizeInvite(text: string): string | null {
  const candidate = text.trim().toUpperCase();
  if (candidate.length !== INVITE_CODE_LENGTH) return null;
  for (const char of candidate) {
    if (!LETTERS.has(char)) return null;
  }
  return candidate;
}

export function invitePath(code: string): string {
  return `/table/${code.toUpperCase()}`;
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}${invitePath(code)}`;
}

/** 链接里的 /table/<code> 段；不带协议、带尾斜杠、带 ?query#hash 都能命中 */
const CODE_IN_URL = /\/table\/([A-Za-z0-9]+)/;

/**
 * 从用户输入里取出邀请码：接受裸码、任意大小写、两侧空白，
 * 也接受直接粘贴完整邀请链接（`https://host/table/ABC123/`、带查询或哈希）。
 * 解析不出返回 null（由调用方给出提示）。
 */
export function parseInvite(text: string): string | null {
  const raw = text.trim();
  if (raw.length === 0) return null;

  const direct = normalizeInvite(raw);
  if (direct !== null) return direct;

  const match = CODE_IN_URL.exec(raw);
  return match === null ? null : normalizeInvite(match[1]!);
}
