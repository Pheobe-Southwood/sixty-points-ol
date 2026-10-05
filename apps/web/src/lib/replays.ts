import type { DealSummary } from '@sixty/engine';

/**
 * 机器重演的浏览器侧形状（ADR-0016）：与 `@sixty/bot` 的 `ReplayResult` 同形。
 * 单独声明而不是 `import type` 策略包：客户端不依赖机器人策略（那是服务端的领域，
 * `import-scan` 的白名单思路也这么说），形状漂移由 `replays.test.ts` 的路由断言钉住。
 */
export type ReplayResult =
  | { readonly kind: 'scored'; readonly summary: DealSummary }
  | { readonly kind: 'all-pass' };

export interface ReplayRow {
  readonly dealNo: number;
  readonly result: ReplayResult;
}

/** 拉一张桌的全部重演（结算时算好的只读存档）。失败按「没有」处理，下次点开还会再试 */
export async function fetchReplays(code: string): Promise<ReplayRow[]> {
  const response = await fetch(`/api/tables/${code}/replays`);
  if (!response.ok) return [];
  const parsed = (await response.json()) as { replays: ReplayRow[] };
  return parsed.replays;
}
