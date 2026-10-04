/**
 * stdio 入口的**启动判定**。
 *
 * 抽成纯函数只为一件事：进程级行为（探活、退出码）留在 `stdio.ts`，判定放在这里，
 * 于是「没有凭据到底算不算错」可以在进程内单测，而不是靠 spawn 一个子进程去猜。
 *
 * 凭据是**可选**的：没有 `SIXTY_CREDENTIAL` 不是错误，而是**无身份会话**
 * （只有 `read_rules` 与 `claim` 可用，见 ADR-0014）。所以「缺凭据」不再是退出理由 ——
 * 唯一还会让 stdio 当场退出的仍然是「地址写错 / 服务没起」。
 */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';

export type StartupMode =
  | { readonly mode: 'anonymous'; readonly baseUrl: string }
  | { readonly mode: 'authenticated'; readonly baseUrl: string; readonly credential: string };

export function startupOf(env: Readonly<Record<string, string | undefined>>): StartupMode {
  const baseUrl = (env['SIXTY_BASE_URL'] ?? '').trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
  const credential = (env['SIXTY_CREDENTIAL'] ?? '').trim();
  return credential.length === 0
    ? { mode: 'anonymous', baseUrl }
    : { mode: 'authenticated', baseUrl, credential };
}
