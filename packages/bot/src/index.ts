/**
 * 机器人策略包（ADR-0015）：**个人视图 → 动作** 的纯函数集合。
 *
 * 输入只有引擎公开的类型（`PublicView` + `PlayerSeat`），输出不带座位号 ——
 * 座位一律由服务端按身份推导（ADR-0002）。零 IO、零依赖（除引擎）、确定性。
 */
export { moveFor, fallbackFor, bidFor, buryFor, playFor, strengthOf, willingPoints } from './policy.ts';
export type { BotMove, StrainStrength } from './policy.ts';
export { Sight, classCards, extractChains } from './sight.ts';
