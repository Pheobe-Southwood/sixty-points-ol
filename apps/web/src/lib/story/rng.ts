/**
 * 种子 ↔ 牌局的**唯一口径**。
 *
 * 牌局编排台把「种子」当作牌局的身份证：同一 `seed + 三家级别 + 发牌人` 必须永远重建出同一副牌，
 * 否则作者写的说明会在某次打开时对不上牌面。所以随机数发生器必须钉在仓库里，
 * 不能用 `Math.random`（服务端就是这样，每副不可复现——那是线上牌局需要的性质，这里恰好相反）。
 *
 * 注意：**页面渲染不依赖重算**。牌面在导出时冗余存了一份（`deal.hands` / `deal.originalKitty`），
 * 种子只用于草稿重建与溯源；哪天这里换了算法，老讲解也不会变味。
 */
import type { RNG } from '@sixty/engine';

/** 字符串种子 → uint32（FNV-1a）。空串也给一个稳定值，不做特例。 */
export function seedToUint32(seedText: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  // 全零状态会让 mulberry32 退化，换成一个非零常量
  return hash === 0 ? 0x9e3779b9 : hash;
}

/** mulberry32：32 位状态、无依赖、跨平台结果一致 */
export function mulberry32(seed: number): RNG {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 一副草稿共用一个 RNG 实例 —— 包括三家不叫触发的重发：
 * `newDeal` 每次消耗 54 个随机数，实例跨重发连续推进，回放才能一步步对齐。
 */
export function storyRng(seedText: string): RNG {
  return mulberry32(seedToUint32(seedText));
}

/** 新建草稿时给一个可读的默认种子（作者随时可以改成自己喜欢的数字） */
export function randomSeedText(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}
