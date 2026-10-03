/**
 * 结算算式与「闲家要到多少分才能把庄家打输」（纯函数）。
 *
 * 教程里原来写「两名闲家合计抓到 100 − 45 = 55 分就把他打输」——
 * 这忽略了底牌分：底分按末轮张数进退庄家的账，闲家的门槛并不等于 100 − 定约。
 * 这里把门槛算出来，教程直接渲染结果，不再手写数字。
 *
 * 记号：D = 庄家墩分、F = 闲家墩分、k = 底牌分、m = 末轮张数、X = 定约分。
 * 恒等式 D + F + k = 100（全场 100 分，底牌那 3 张也在这 100 分里）。
 */

export interface SettleInput {
  readonly contract: number;
  readonly kittyPoints: number;
  readonly multiplier: number;
}

export interface SettlePreview {
  /** 保底（末轮庄家赢）时闲家必须「严格超过」的分数 */
  readonly protectBar: number;
  /** 抠底（末轮闲家赢）时闲家必须「严格超过」的分数 */
  readonly digBar: number;
  /** 忽略底牌分的直觉值 100 − 定约分；只有 k = 0 时它才是对的 */
  readonly naiveBar: number;
  /** 底牌分对门槛的位移：保底 +k(m−1)、抠底 −k(m+1) 的绝对值说明 */
  readonly shift: { readonly protect: number; readonly dig: number };
}

export function finalScoreOf(input: {
  readonly declarerPoints: number;
  readonly kittyPoints: number;
  readonly multiplier: number;
  readonly protectedBottom: boolean;
}): number {
  const bottom = input.multiplier * input.kittyPoints;
  return input.declarerPoints + (input.protectedBottom ? bottom : -bottom);
}

/** 由庄家墩分与底牌分反推闲家墩分（全场 100 分） */
export function defenderPointsOf(declarerPoints: number, kittyPoints: number): number {
  return 100 - declarerPoints - kittyPoints;
}

/**
 * 闲家把庄家打输所需要的墩分（严格大于该值）。
 * 保底：final = D + mk < X，代入 D = 100 − F − k ⇒ F > 100 − X + k(m−1)
 * 抠底：final = D − mk < X ⇒ F > 100 − X − k(m+1)
 */
export function settlePreview(input: SettleInput): SettlePreview {
  const { contract, kittyPoints: k, multiplier: m } = input;
  const base = 100 - contract;
  const protectShift = k * (m - 1);
  const digShift = -k * (m + 1);
  return {
    protectBar: base + protectShift,
    digBar: base + digShift,
    naiveBar: base,
    shift: { protect: protectShift, dig: Math.abs(digShift) }
  };
}
