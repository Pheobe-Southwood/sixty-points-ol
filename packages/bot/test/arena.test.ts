/**
 * 参数竞技场单测（ADR-0017）。这里守的是**比较这件事本身**能不能信：
 *
 * 1. **基线等价** —— 不传参数与显式 `BASELINE_PARAMS` 打完整局逐字节相同（整局台覆盖全部决策点）；
 * 2. **确定性** —— 同一 cell 跑两遍逐字节相同（报告可复现）；
 * 3. **A/A 恒 0** —— 两侧同配置时，逐种子的配对差必须**恒等于 0**：这既是估计量无偏的证明，
 *    也是「同一种子 = 同一副牌」这条设计的证明（轮换没有偷偷换牌）；
 * 4. **严格配对** —— 只改打牌参数时，同一颗种子的合同与将牌不变（不然比的是两副不同的牌）；
 * 5. **估计量非空转** —— 合成数据上 CI 覆盖已知真值、置换检验有方向；
 * 6. **功效非空转** —— 一个明知更差的残废变体必须被判为显著更差（否则台子是瞎的）；
 * 7. **开关接线** —— 三个开关各自改变自己那项机制计数（计数不动 = 开关没接上）。
 *
 * 断言里不写「通过/不通过」的主观话术，全部是可复算的数字。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  average,
  clusterEffect,
  clusterSd,
  countersOfConfig,
  holmBonferroni,
  improvementPerSeat,
  minimumDetectable,
  pairedBySeed,
  rotateSeats,
  runDealCell,
  runGameCell,
  stdev,
  type ArenaConfig,
  type DealRecord,
  type GameRecord
} from '../src/arena.ts';
import { BASELINE_PARAMS, type BotParams } from '../src/policy.ts';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rngFactory = (seed: number): (() => number) => mulberry32(seed);
const seedsOf = (count: number): number[] => Array.from({ length: count }, (_, i) => i + 1);

/** 「轮换前谁坐哪个配置」：1 个变体 + 2 个基线（`variant` 是配置表里的下标） */
const oneVariant = (variant: number): [number, number, number] => [variant, 0, 0];

function dealCell(
  configs: readonly ArenaConfig[],
  seatConfigs: readonly [number, number, number],
  seeds: number,
  rotations: number
): readonly DealRecord[] {
  return runDealCell({
    seeds: seedsOf(seeds),
    rotations,
    assign: (rotation) => rotateSeats(seatConfigs, rotation),
    configs,
    rngFactory
  });
}

/** 本文件统一的对照约定：配置 1 = 变体、配置 0 = 基线 → 逐种子的配对差 */
const diffsOf = (records: readonly DealRecord[]): number[][] =>
  pairedBySeed(
    records,
    (record) => ({ seed: record.seed, rotation: record.rotation }),
    improvementPerSeat,
    1,
    0
  );

/** 每 100 座位-副的计数：1 个变体 vs 2 个基线的**原始**计数天生差一倍，不归一就没法比 */
const per100 = (count: number, seatDeals: number): number => (seatDeals === 0 ? 0 : (count / seatDeals) * 100);

const seatDealsOf = (records: readonly DealRecord[], config: number): number =>
  records.reduce(
    (sum, record) => sum + [0, 1, 2].filter((seat) => record.configOfSeat[seat] === config).length,
    0
  );

// ---------------------------------------------------------------------------
// 1–2. 基线等价与确定性
// ---------------------------------------------------------------------------

test('基线等价：不传参数与显式 BASELINE_PARAMS 打完整局逐字节相同', () => {
  const seeds = seedsOf(6);
  const implicit = runGameCell({ seeds, rotations: 2, assign: (r) => rotateSeats([0, 0, 0], r), configs: [undefined], rngFactory });
  const explicit = runGameCell({
    seeds,
    rotations: 2,
    assign: (r) => rotateSeats([0, 0, 0], r),
    configs: [BASELINE_PARAMS],
    rngFactory
  });
  assert.equal(JSON.stringify(implicit), JSON.stringify(explicit), '缺省参数必须与显式基线同一条路径');
  assert.ok(implicit.every((game) => game.deals >= 1), '整局台至少打完一副，否则这条断言覆盖不到决策');
  assert.ok(implicit.some((game) => game.status === 'finished'), '样本里要有打完的整局（不然只覆盖了前半段）');
});

test('确定性：同一 cell 跑两遍逐字节相同', () => {
  const configs = [undefined, { ruffPolicy: 'always' } satisfies Partial<BotParams>] as const;
  const a = dealCell(configs, oneVariant(1), 12, 3);
  const b = dealCell(configs, oneVariant(1), 12, 3);
  assert.equal(JSON.stringify(a), JSON.stringify(b), '同种子同轮换必须给出同一条记录');
});

// ---------------------------------------------------------------------------
// 3–4. A/A 恒 0 与严格配对
// ---------------------------------------------------------------------------

test('A/A：两侧同配置时，每个种子的配对差**均值**恒等于 0（轮换没有偷换牌）', () => {
  // 轮换取 3（必须）：座位偏差靠「每个座位都当过一次变体」抵消。少转一圈就取消不干净 ——
  // rotations=2 时 A/A 的均值是 −0.006 而不是 0，那是座位偏差而不是「轮换偷换了牌」。
  const records = dealCell([undefined, undefined], oneVariant(1), 24, 3);
  const diffs = diffsOf(records);
  assert.equal(diffs.length, 24, '每颗种子一行');
  for (const list of diffs) {
    assert.equal(list.length, 3, '每颗种子三圈轮换');
    // 单圈的值本来就不为 0（它是「某个座位 vs 另外两个座位」），**均值**才必须恒为 0：
    // 三圈把每个座位都当过一次「变体」，座位/角色偏差因此在种子内部被精确抵消。
    assert.ok(Math.abs(average(list)) < 1e-12, `种子的三圈均值必须是 0，实际 ${average(list)}`);
  }
  const effect = clusterEffect(diffs, mulberry32(1), 2000, 2000);
  assert.equal(effect.mean, 0);
  assert.equal(effect.ciLow, 0);
  assert.equal(effect.ciHigh, 0);
  assert.equal(effect.pValue, 1);
  assert.equal(clusterSd(diffs), 0, 'A/A 的 σ(D_s) 恒为 0 —— 所以 MDE 这条读数对 A/A 是退化的');
});

test('严格配对：只改打牌参数时，同一颗种子的合同与将牌不变', () => {
  const base = dealCell([undefined, undefined], oneVariant(1), 24, 3);
  const variant = dealCell(
    [undefined, { ruffPolicy: 'never' } satisfies Partial<BotParams>],
    oneVariant(1),
    24,
    3
  );
  const key = (record: DealRecord): string =>
    `${record.seed}/${record.rotation}/${JSON.stringify(record.contract)}/${JSON.stringify(record.trump)}`;
  assert.deepEqual(variant.map(key), base.map(key), '只改打牌参数时，牌与合同必须一模一样');
  assert.ok(
    base.some((record) => record.contract !== null),
    '样本里要有真打出合同的副，否则这条断言是空转的'
  );
});

// ---------------------------------------------------------------------------
// 5. 估计量
// ---------------------------------------------------------------------------

test('估计量：合成数据上 CI 覆盖真值、置换检验有方向、Holm 与 MDE 数值正确', () => {
  const zeros = clusterEffect([[0, 0, 0], [0, 0, 0], [0, 0, 0]], mulberry32(7), 500, 500);
  assert.deepEqual([zeros.mean, zeros.ciLow, zeros.ciHigh, zeros.pValue], [0, 0, 0, 1]);

  const shifted = Array.from({ length: 40 }, () => [0.5, 0.5, 0.5]);
  const strong = clusterEffect(shifted, mulberry32(7), 2000, 2000);
  assert.equal(strong.mean, 0.5);
  assert.ok(strong.ciLow > 0, `显著性方向应正确，CI 下界 ${strong.ciLow}`);
  assert.ok(strong.pValue < 0.01, `置换检验应给出小 p，实际 ${strong.pValue}`);

  const mixed = clusterEffect([[0.2, -0.1, 0.0], [0.0, 0.0, 0.0], [-0.2, 0.1, 0.0]], mulberry32(9), 500, 500);
  assert.ok(mixed.ciLow <= mixed.mean && mixed.mean <= mixed.ciHigh, '均值必须落在自己的 CI 里');

  assert.deepEqual(holmBonferroni([0.001, 0.02, 0.5]), [true, true, false]);
  assert.deepEqual(holmBonferroni([0.04, 0.04]), [false, false], '两个 0.04 过不了 α/2=0.025');
  assert.ok(Math.abs(minimumDetectable(1, 100) - 0.28) < 1e-12);
  assert.equal(minimumDetectable(1, 0), Number.POSITIVE_INFINITY);
  assert.ok(Math.abs(stdev([1, 2, 3, 4, 5]) - Math.sqrt(2.5)) < 1e-12);
  // σ(D_s) 取**种子均值**的离散度：同配置时恒 0（A/A 的退化是设计使然，不是估计量坏了）
  assert.equal(clusterSd([[0, 0, 0], [1, -1, 0], [-1, 1, 0]]), 0);
  assert.ok(clusterSd([[1, 1, 1], [3, 3, 3]]) > 0);
});

// ---------------------------------------------------------------------------
// 6. 功效：一个明知更差的变体必须被抓出来
// ---------------------------------------------------------------------------

test('功效非空转：放弃争墩的残废变体必须被判为显著更差', () => {
  // 两个门槛都抬到 20：跟牌不争、缺门不杀（只剩末轮与「庄家差分」那两条仍然动手）
  const records = dealCell(
    [undefined, { winPointThreshold: 20, ruffPointThreshold: 20 } satisfies Partial<BotParams>],
    oneVariant(1),
    60,
    3
  );
  const diffs = diffsOf(records);
  const effect = clusterEffect(diffs, mulberry32(11), 2000, 2000);
  assert.ok(effect.mean < 0, `残废变体应当更差，实际 Δ=${effect.mean}`);
  assert.ok(effect.ciHigh < 0, `应当显著，CI 上界 ${effect.ciHigh}`);
  // 台子也得有分辨力：MDE 不能和效应本身一个量级（否则这条「抓到了」只是运气）
  const mde = minimumDetectable(clusterSd(diffs), effect.units);
  assert.ok(mde < 0.3, `MDE(${mde}) 太大：这个台子分辨不出这个量级的效应`);
});

// ---------------------------------------------------------------------------
// 7. 开关接线：计数必须跟着开关动
// ---------------------------------------------------------------------------

test('开关接线：杀牌 / 抢同伴 / 喂分各自改变对应的机制计数', () => {
  const seeds = seedsOf(40);
  const rotations = 3;
  // 两侧都**显式**给参数，绝不靠「默认值就是关」这件事：默认值会随晋升而变
  // （ADR-0017 之后 `partnerAware` / `feedPartner` 默认就是开的），
  // 那样写的话这条测试会静默退化成「拿默认跟默认比」。
  const run = (left: Partial<BotParams>, right: Partial<BotParams>): readonly DealRecord[] =>
    runDealCell({
      seeds,
      rotations,
      assign: (rotation) => rotateSeats(oneVariant(1), rotation),
      configs: [left, right],
      rngFactory
    });
  const rate = (records: readonly DealRecord[], config: number, key: keyof ReturnType<typeof countersOfConfig>): number =>
    per100(countersOfConfig(records, config)[key], seatDealsOf(records, config));

  const OFF = { partnerAware: false, feedPartner: false } satisfies Partial<BotParams>;
  const ruffs = run({ ...OFF }, { ...OFF, ruffPolicy: 'always' });
  assert.ok(
    rate(ruffs, 1, 'ruffAttempts') > rate(ruffs, 0, 'ruffAttempts'),
    `ruffPolicy=always 每 100 座位-副该杀得更多：${rate(ruffs, 1, 'ruffAttempts')} vs ${rate(ruffs, 0, 'ruffAttempts')}`
  );

  const aware = run({ ...OFF }, { ...OFF, partnerAware: true });
  const baseOvertakes = rate(aware, 0, 'partnerOvertakes');
  assert.ok(baseOvertakes > 0, `关掉同伴概念时本来就该出现抢同伴的回合，实际 ${baseOvertakes}（否则这条断言是空转的）`);
  assert.ok(
    rate(aware, 1, 'partnerOvertakes') < baseOvertakes,
    `partnerAware 必须把「抢同伴已定的赢墩」压下去：${rate(aware, 1, 'partnerOvertakes')} vs ${baseOvertakes}`
  );

  // 计数是**观测**出来的（不管意图）：谁都会在「没得选」的时候把分交给同伴，
  // 所以这里比的是**同一个开关开/关**时的速率差，而不是「关着必须为 0」。
  const feed = run({ ...OFF }, { ...OFF, feedPartner: true });
  assert.ok(
    rate(feed, 1, 'partnerFeedPoints') > rate(feed, 0, 'partnerFeedPoints'),
    `feedPartner 必须把「给同伴送分」抬起来：${rate(feed, 1, 'partnerFeedPoints')} vs ${rate(feed, 0, 'partnerFeedPoints')}`
  );
  assert.ok(rate(feed, 1, 'partnerFeedPoints') > 0, 'feedPartner 开着却一点分都没送出去 = 开关没接上');
});

// ---------------------------------------------------------------------------
// 8. 晋升是真的：默认值必须等于竞技场量出来的那一套
// ---------------------------------------------------------------------------

test('默认参数就是 ADR-0017 量出来的那一套（防止默认值被悄悄改回去）', () => {
  // 没有这条，把 `bidLadderBase` 改回 12 只会让「基线等价」测试照样绿 —— 那条测的是
  // 「不传 = 显式传默认」，对默认值本身是什么完全不敏感。
  assert.deepEqual(BASELINE_PARAMS, {
    bidBar: 12,
    bidLadderBase: 6,
    bidStepStrength: 3,
    bidStepPoints: 5,
    maxWilling: 85,
    bidJump: false,
    buryGamble: true,
    buryGambleMaxPoints: 10,
    buryGambleMinTrumps: 9,
    buryGambleStrongTrumps: 10,
    winPointThreshold: 5,
    ruffPointThreshold: 5,
    ruffPolicy: 'points-only',
    leadCaution: { declarer: 1, defender: 2 },
    leadPriority: 'draw-first',
    keepBigJoker: false,
    protectPointedKitty: false,
    drawTrumps: 'unseen',
    discardPointWeight: 30,
    partnerAware: true,
    feedPartner: true
  });
  // 而「被否掉的那几项」必须留在历史值上 —— 它们是被量过而不采纳的，不是没试过。
  // `discardPointWeight: 0` 就在这一组里：五次测量全为正，但幅度远低于事先定下的
  // 「≥ +0.1 级/座位」门槛、整局台过不了 Holm、而且机制说不清（见 ADR-0017）。
  const rejected: Partial<BotParams> = {
    bidJump: true,
    ruffPolicy: 'never',
    keepBigJoker: true,
    protectPointedKitty: true,
    leadPriority: 'side-first',
    buryGamble: false,
    discardPointWeight: 0
  };
  for (const [key, value] of Object.entries(rejected)) {
    assert.notDeepEqual(
      BASELINE_PARAMS[key as keyof BotParams],
      value,
      `${key} 在竞技场里是负收益（见 ADR-0017 的表），不该出现在默认值里`
    );
  }
});

// ---------------------------------------------------------------------------
// 附：整局台的读数也要能用（进度 → 每座位平均）
// ---------------------------------------------------------------------------

test('整局台：能算出每座位进度读数与逐种子配对差', () => {
  const games: readonly GameRecord[] = runGameCell({
    seeds: seedsOf(4),
    rotations: 2,
    assign: (rotation) => rotateSeats(oneVariant(1), rotation),
    configs: [undefined, { partnerAware: true, feedPartner: true } satisfies Partial<BotParams>],
    rngFactory
  });
  const diffs = pairedBySeed(
    games,
    (record) => ({ seed: record.seed, rotation: record.rotation }),
    (record, config) => {
      const seats = [0, 1, 2].filter((seat) => record.configOfSeat[seat] === config);
      if (seats.length === 0) return null;
      return seats.reduce((sum, seat) => sum + record.progress[seat]!, 0) / seats.length;
    },
    1,
    0
  );
  assert.equal(diffs.length, 4, '每颗种子一行');
  assert.ok(
    games.every((game) => game.deals >= 1),
    '整局台至少要打完一副'
  );
});
