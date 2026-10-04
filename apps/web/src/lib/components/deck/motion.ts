/**
 * 演示页的动画词汇（克制版四件事）：
 *
 * 1. **出牌从手牌横条飞进出牌区**：同一张牌在两个区域用同一个 key 配对（crossfade），
 *    所以看起来是「这张牌被打了出去」，而不是一处淡入、一处淡出；
 * 2. **手牌里少掉的牌跟着飞走**：就是 1 的另一半，不会凭空消失；
 * 3. **赢家徽标弹入**（scale）；
 * 4. **墩分跳一下**（pop）。
 *
 * 两条硬规矩：单次动画都 ≤300ms；系统设了「减少动态效果」时一律 0ms
 * （纯 CSS 动画由 `app.css` 里那段 `prefers-reduced-motion` 媒体查询关掉）。
 */
import { cubicOut } from 'svelte/easing';
import { crossfade } from 'svelte/transition';

/** 出牌飞行的基准时长（毫秒） */
export const CARD_FLIGHT_MS = 260;

let reduceQuery: MediaQueryList | null = null;

/** 系统是否要求减少动态效果（SSR 下恒为 false） */
export function reducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  reduceQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');
  return reduceQuery.matches;
}

/** 动画时长：减少动态效果时归零，调用点不必各自判断 */
export function motionMs(base: number): number {
  return reducedMotion() ? 0 : base;
}

/** 同一张牌在两个区域之间的配对键：座位 + 牌键（一副牌里每张牌唯一，带座位是为了读日志时能认人） */
export function cardAnimKey(seat: number, key: string): string {
  return `${seat}:${key}`;
}

/**
 * 手牌横条与出牌区共用的一对过渡：手牌里 `out:sendCard`、出牌区里 `in:receiveCard`。
 *
 * 找不到配对时（例如深链直接落在某一墩、或从别处跳进来）走 `fallback`：轻微上浮 + 淡入，
 * 不会留下一张僵在空中的牌。
 */
export const [sendCard, receiveCard] = crossfade({
  duration: () => motionMs(CARD_FLIGHT_MS),
  easing: cubicOut,
  fallback: () => ({
    duration: motionMs(200),
    easing: cubicOut,
    css: (t) => `opacity:${t};transform:translateY(${(1 - t) * -10}px)`
  })
});
