/**
 * 复制文本。
 *
 * 手机用 `http://192.168.x.x:PORT` 打开本站属于「非安全上下文」，
 * `navigator.clipboard` 整个是 `undefined`——只调 Clipboard API 会让「点邀请码复制」
 * 静默失败，所以必须保留 execCommand 回退；两条路都不行时返回 false，
 * 由调用方展示可手动复制的链接。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 权限被拒或非安全上下文：继续走回退路径
  }

  try {
    if (typeof document === 'undefined') return false;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
