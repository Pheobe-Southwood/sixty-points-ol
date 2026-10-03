/**
 * 浏览器里的凭据串存放处（localStorage）。
 *
 * 凭据串内嵌名字（`base64url(名字:令牌)`），所以**改名或换身份后必须重写它**，
 * 否则旧串当场失效（findByCredential 按名字查用户）。大厅与同桌页共用这一份，
 * 避免两处各写一个 key 再各自漂移。
 */
export const CREDENTIAL_STORAGE_KEY = 'sixty.credential';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function savedCredential(): string | null {
  return storage()?.getItem(CREDENTIAL_STORAGE_KEY) ?? null;
}

export function saveCredential(credential: string): void {
  storage()?.setItem(CREDENTIAL_STORAGE_KEY, credential);
}

export function clearCredential(): void {
  storage()?.removeItem(CREDENTIAL_STORAGE_KEY);
}
