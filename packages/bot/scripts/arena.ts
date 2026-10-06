/**
 * 参数竞技场 CLI（ADR-0017）：把变体目录批量跑成一张带置信区间的效应表。
 *
 * 运行（在 `packages/bot` 下）：
 *   node scripts/arena.ts --mode deal --seeds 1000 --rotations 3
 *   node scripts/arena.ts --mode deal --only partner-aware,partner-feed --seeds 3000 --ratio 2
 *   node scripts/arena.ts --mode game --seeds 120 --rotations 3
 *   node scripts/arena.ts --mode deal --only _none --mix 'bar-10,ladder-8' --seeds 6000
 *   node scripts/arena.ts --mode deal --baseline legacy-baseline --only _none --mix 'bar-10,ladder-8'
 *   根目录：`pnpm arena -- --seeds 200 --only ruff-always`
 *
 * 几个容易踩的坑，都写在 help 里免得下次再踩：
 * - `--only` 不给 = **跑整个目录**（几十个 cell）；只要组合 cell 就写 `--only _none` 配 `--mix`。
 * - `--mix` 按**变体名**合并参数，名字写错会在构造阶段就抛错、整轮不跑（`ladder-6` 其实叫 `bid-ladder-6`）。
 * - `--baseline <名>` 指定配置 0（默认 = 当前出厂默认）。晋升之后 `undefined` 就是**新**默认，
 *   所以「晋升前 vs 晋升后」必须用 `--baseline legacy-baseline` 才量得出来。
 *
 * 设计要点（都是为了让「比较」真的成立）：
 * - **同一种子 = 同一副牌**：`rngFactory` 只取决于（种子, 轮换），与 cell 无关，
 *   于是所有 cell 拿到的牌完全一样；只改打牌参数的 cell 连叫牌与合同都一样（严格配对）。
 * - **座位轮换**：`seatConfigs` 是「轮换前谁坐哪个配置」，`assignFrom` 把它整体转着放，
 *   三圈取平均 ⇒ 座位/角色的系统性偏差被消掉，1:2 与 2:1 用同一套数说话。
 * - **独立单位是种子**：同一颗种子的三圈是聚类的，所以先按种子取平均再算 CI 与置换检验。
 * - **A/A 标定**：默认多跑一个「基线 vs 基线」的 cell，给出本批牌的零假设离散度与
 *   最小可检测效应（MDE）—— 报告里的「显著」必须比它粗才有意义。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clusterEffect,
  clusterSd,
  countersOfConfig,
  holmBonferroni,
  improvementPerSeat,
  minimumDetectable,
  pairedBySeed,
  progressPerSeat,
  rotateSeats,
  runDealCell,
  runGameCell,
  stdev,
  type ArenaConfig,
  type ClusterEffect,
  type DealCounters,
  type DealRecord,
  type GameRecord
} from '../src/arena.ts';
import type { BotParams } from '../src/policy.ts';
import { BASELINE_PARAMS, paramsOf } from '../src/policy.ts';

// ---------------------------------------------------------------------------
// 变体目录
// ---------------------------------------------------------------------------

interface Variant {
  readonly name: string;
  readonly note: string;
  readonly params: Partial<BotParams>;
  /** 这个开关一旦生效，**必须**在计数上看到的字段（看不到就是没接线） */
  readonly evidence: readonly (keyof DealCounters)[];
}

/**
 * 变体目录（第一轮快筛）：一条一开关，另加几条反向对照。
 * 每条都只写「我改了哪几项」，其余落基线（`paramsOf`）——避免抄错一项参数就是一次假实验。
 */
const VARIANTS: readonly Variant[] = [
  { name: 'ruff-always', note: '缺门能杀就杀（含 0 分墩）', params: { ruffPolicy: 'always' }, evidence: ['ruffAttempts', 'ruffsWon'] },
  { name: 'ruff-never', note: '缺门从不杀（对照）', params: { ruffPolicy: 'never' }, evidence: ['ruffAttempts'] },
  { name: 'fight-every', note: '跟牌与杀牌都见墩就争（两个门槛都归零）', params: { winPointThreshold: 0, ruffPointThreshold: 0 }, evidence: ['tricksWon', 'ruffAttempts'] },
  { name: 'follow-fight-all', note: '只把**跟牌**门槛归零（杀牌门槛不动）—— 从 fight-every 里拆出好的那一半', params: { winPointThreshold: 0 }, evidence: ['tricksWon', 'ruffAttempts'] },
  { name: 'fight-big-only', note: '只争大分墩（阈值 20，对照）', params: { winPointThreshold: 20 }, evidence: ['tricksWon'] },
  { name: 'discard-loose', note: '垫牌完全不计较分（权重 0，对照）', params: { discardPointWeight: 0 }, evidence: ['pointsToDeclarerPoints'] },
  { name: 'discard-greedy', note: '垫牌更舍不得给分（权重 90）', params: { discardPointWeight: 90 }, evidence: ['pointsToDeclarerPoints'] },
  { name: 'partner-aware', note: '认识同伴：不抢/不杀同伴已定的赢墩', params: { partnerAware: true }, evidence: ['partnerOvertakes', 'partnerSettledTurns'] },
  { name: 'partner-feed', note: '同伴已定赢墩时把分垫给同伴', params: { partnerAware: true, feedPartner: true }, evidence: ['partnerFeeds', 'partnerFeedPoints', 'partnerOvertakes'] },
  { name: 'feed-only', note: '只喂分、不理会抢墩（拆开看是哪一半在起作用）', params: { feedPartner: true }, evidence: ['partnerFeeds'] },
  { name: 'side-first', note: '先兑现副门必得分再吊主', params: { leadPriority: 'side-first' }, evidence: ['trumpLeads', 'sideMultiLeads'] },
  { name: 'keep-big-joker', note: '不拿大王去吊主', params: { keepBigJoker: true }, evidence: ['bigJokerLeads'] },
  { name: 'protect-kitty', note: '庄家：自己底牌有分时顶主留末轮', params: { protectPointedKitty: true }, evidence: ['trumpLeads', 'bigJokerLeads'] },
  { name: 'draw-never', note: '从不吊主（对照）', params: { drawTrumps: 'never' }, evidence: ['trumpLeads'] },
  { name: 'lead-aggressive', note: '领出更激进（未见牌余量 1/2）', params: { leadCaution: { declarer: 1, defender: 2 } }, evidence: ['sideMultiLeads'] },
  { name: 'lead-cautious', note: '领出更保守（余量 4/8，对照）', params: { leadCaution: { declarer: 4, defender: 8 } }, evidence: ['sideMultiLeads'] },
  { name: 'bid-both-6', note: '叫牌更积极（门槛 6 + 阶梯原点 6，= 首轮的 bid-6）', params: { bidBar: 6, bidLadderBase: 6 }, evidence: ['openings', 'competitions'] },
  { name: 'bid-open-6', note: '只降**开叫门槛**到 6（竞叫上限不动）—— 把「多开叫」与「多竞叫」拆开', params: { bidBar: 6 }, evidence: ['openings', 'competitions'] },
  { name: 'bid-ladder-6', note: '只把**竞叫阶梯原点**降到 6（开叫门槛不动）', params: { bidLadderBase: 6 }, evidence: ['competitions'] },
  { name: 'bid-both-8', note: '门槛 8 + 阶梯 8（找拐点）', params: { bidBar: 8, bidLadderBase: 8 }, evidence: ['openings', 'competitions'] },
  { name: 'bid-both-10', note: '门槛 10 + 阶梯 10（找拐点）', params: { bidBar: 10, bidLadderBase: 10 }, evidence: ['openings', 'competitions'] },

  // ---- 叫牌精细扫描（ADR-0017 之后追加）----
  // 晋升时只量过阶梯原点 6 与 12 两个点，等于在一条没画过的曲线上取了一个点就当最优。
  // 下面这一组把曲线画出来：先扫原点（竞叫上限），再扫门槛（够不够格开叫）、阶梯斜率与封顶。
  { name: 'ladder-0', note: '竞叫阶梯原点 0（最凶：任何牌都愿意加到 60~85）', params: { bidLadderBase: 0 }, evidence: ['competitions'] },
  { name: 'ladder-2', note: '竞叫阶梯原点 2', params: { bidLadderBase: 2 }, evidence: ['competitions'] },
  { name: 'ladder-3', note: '竞叫阶梯原点 3', params: { bidLadderBase: 3 }, evidence: ['competitions'] },
  { name: 'ladder-4', note: '竞叫阶梯原点 4', params: { bidLadderBase: 4 }, evidence: ['competitions'] },
  { name: 'ladder-8', note: '竞叫阶梯原点 8（比默认温和）', params: { bidLadderBase: 8 }, evidence: ['competitions'] },
  { name: 'ladder-10', note: '竞叫阶梯原点 10', params: { bidLadderBase: 10 }, evidence: ['competitions'] },
  { name: 'bar-8', note: '开叫门槛 8（阶梯仍是默认 6）', params: { bidBar: 8 }, evidence: ['openings', 'competitions'] },
  { name: 'bar-10', note: '开叫门槛 10', params: { bidBar: 10 }, evidence: ['openings', 'competitions'] },
  { name: 'bar-11', note: '开叫门槛 11', params: { bidBar: 11 }, evidence: ['openings', 'competitions'] },
  { name: 'bar-13', note: '开叫门槛 13', params: { bidBar: 13 }, evidence: ['openings', 'competitions'] },
  { name: 'bar-14', note: '开叫门槛 14', params: { bidBar: 14 }, evidence: ['openings', 'competitions'] },
  { name: 'step-strength-2', note: '阶梯更陡（每 2 点牌力上一档，更早叫到高分）', params: { bidStepStrength: 2 }, evidence: ['competitions'] },
  { name: 'step-strength-4', note: '阶梯更缓（每 4 点上一档）', params: { bidStepStrength: 4 }, evidence: ['competitions'] },
  { name: 'step-points-10', note: '阶梯每档 10 分（上限爬得更快）', params: { bidStepPoints: 10 }, evidence: ['competitions'] },
  { name: 'max-willing-95', note: '愿意分数封顶 85 → 95', params: { maxWilling: 95 }, evidence: ['competitions'] },
  { name: 'ladder-0-cap-95', note: '原点 0 且封顶 95（把「更凶」推到极限的那一版）', params: { bidLadderBase: 0, maxWilling: 95 }, evidence: ['competitions'] },

  // ---- 真实对局（表 8）诊断出的四条打法缺陷（默认全关，逐条单独量）----
  { name: 'own-card-points', note: '争墩时把「我要出的那张牌自带的分」算进去（d4#2：♥5 送进庄家赢墩）', params: { countOwnCardPoints: true }, evidence: ['pointsToDeclarerPoints', 'tricksWon'] },
  { name: 'no-gift-exit', note: '领出兜底不送牌（d4#9 ♠K 丢 20、d6#4 ♣K、d6#8 ♥K）', params: { noGiftExit: true }, evidence: ['pointsToDeclarerPoints'] },
  { name: 'trump-run-lead', note: '主牌顺子整段领出逼顺（d6#0/#1 双王分两轮单出）', params: { trumpRunLead: true }, evidence: ['trumpLeads', 'sideMultiLeads'] },
  { name: 'draw-when-long', note: '主牌够长时顶主不必胜也吊主（d3：8 张主全程没吊）', params: { drawWhenLong: true }, evidence: ['trumpLeads'] },
  { name: 'draw-when-long-4', note: '同上，阈值放宽到 4 张主', params: { drawWhenLong: true, drawWhenLongMinTrumps: 4 }, evidence: ['trumpLeads'] },
  { name: 'no-gift+draw', note: '两条领出纪律合起来', params: { noGiftExit: true, drawWhenLong: true }, evidence: ['trumpLeads', 'pointsToDeclarerPoints'] },
  { name: 'dump-discipline', note: '让利时挑送分最少的窗（d4#2 的 ♥5 正解，不花代价）', params: { dumpDiscipline: true }, evidence: ['pointsToDeclarerPoints'] },
  { name: 'draw-into-joker', note: '只被王压着的顶主也吊出去（把那张王钓掉，之后主牌就是我最大）', params: { drawIntoJoker: true }, evidence: ['trumpLeads'] },
  { name: 'run-lead+dump', note: '逼顺 + 垫牌不送分', params: { trumpRunLead: true, dumpDiscipline: true }, evidence: ['trumpLeads', 'pointsToDeclarerPoints'] },
  { name: 'run-lead+joker', note: '逼顺 + 钓王', params: { trumpRunLead: true, drawIntoJoker: true }, evidence: ['trumpLeads'] },
  { name: 'declarer-trim', note: '逼顺 + 钓王 + 垫牌不送分 + 兜底不送牌（四条里唯一为正的那条为主）', params: { trumpRunLead: true, drawIntoJoker: true, dumpDiscipline: true, noGiftExit: true }, evidence: ['trumpLeads', 'pointsToDeclarerPoints'] },
  { name: 'bid-16', note: '叫牌更保守（门槛 16，对照）', params: { bidBar: 16 }, evidence: ['openings'] },
  { name: 'bid-jump', note: '跳叫到愿意分数（对照：ADR-0015 认为买不到级数）', params: { bidJump: true }, evidence: ['openings', 'competitions'] },
  { name: 'no-bury-gamble', note: '埋底一分不埋（对照）', params: { buryGamble: false }, evidence: [] },
  {
    // 晋升之后 `undefined` 就是**新**默认，所以「历史基线」必须显式写出来才量得到。
    // 它的值等于晋升前那一版 `BASELINE_PARAMS`（见 ADR-0017 的记录）。
    name: 'legacy-baseline',
    note: '晋升前的历史基线（显式写出，用来量「这轮到底改了多少」）',
    params: {
      bidLadderBase: 12,
      winPointThreshold: 5,
      ruffPointThreshold: 5,
      ruffPolicy: 'points-only',
      leadCaution: { declarer: 2, defender: 5 },
      leadPriority: 'draw-first',
      keepBigJoker: false,
      protectPointedKitty: false,
      drawTrumps: 'unseen',
      discardPointWeight: 30,
      partnerAware: false,
      feedPartner: false
    },
    evidence: []
  }
];

// ---------------------------------------------------------------------------
// 命令行
// ---------------------------------------------------------------------------

/**
 * 解析命令行。**同一个旗标可以给多次**（`--mix a,b --mix c,d` 是两个组合 cell），
 * 所以值是数组而不是单值 —— 早先只留最后一个，第二个组合会被悄悄丢掉
 * （比报错更糟：报告少一行、而人以为它跑过了）。
 */
function parseArgs(argv: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const value = next !== undefined && !next.startsWith('--') ? next : 'true';
    if (next !== undefined && !next.startsWith('--')) i += 1;
    const list = out.get(key) ?? [];
    list.push(value);
    out.set(key, list);
  }
  return out;
}

/** 确定性 rng（与 `test/sim.test.ts` 同款 mulberry32；由**脚本**提供，源码那边保持纯） */
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

/**
 * 随机源只取决于**种子** —— 这是「同副牌配对」的全部秘密：
 * 同一颗种子的三圈轮换发出**完全相同的牌**，只有「谁坐哪个配置」在变，
 * 于是 A/A cell 的效应必须恒等于 0（`test/arena.test.ts` 把这条钉死），
 * 而轮换之间的差异只剩纯粹的噪声 —— 正好用来标定 MDE。
 */
const rngFactory = (seed: number): (() => number) => mulberry32(seed);

/** 仓库根（脚本在 `packages/bot/scripts/`）：默认产物落在 `data/_analysis/` 下，与当前目录无关 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

type Triple = readonly [number, number, number];

interface CliCell {
  readonly name: string;
  readonly note: string;
  /** 配置表：约定 0 = 基线 */
  readonly configs: readonly ArenaConfig[];
  /** 轮换**前**三家座位上的配置下标 */
  readonly seatConfigs: Triple;
  readonly compare: { readonly variant: number; readonly baseline: number };
  readonly evidence: readonly (keyof DealCounters)[];
}

function assignFrom(seatConfigs: Triple): (rotation: number) => Triple {
  return (rotation) => rotateSeats(seatConfigs, rotation);
}

/** 轮换前「谁坐哪个配置」：ratio 1 = 1 变体 + 2 基线；ratio 2 = 2 变体 + 1 基线 */
const seatConfigsFor = (ratio: number): Triple => (ratio === 2 ? [1, 1, 0] : [1, 0, 0]);

function variantCell(variant: Variant, ratio: number, base: ArenaConfig): CliCell {
  return {
    name: variant.name,
    note: variant.note,
    configs: [base, variant.params],
    seatConfigs: seatConfigsFor(ratio),
    compare: { variant: 1, baseline: 0 },
    evidence: variant.evidence
  };
}

function aaCell(ratio: number, base: ArenaConfig): CliCell {
  return {
    name: 'A/A',
    note: '零假设标定：两侧同配置，效应应恒为 0；离散度用来算 MDE',
    configs: [base, base],
    seatConfigs: seatConfigsFor(ratio),
    compare: { variant: 1, baseline: 0 },
    evidence: []
  };
}

function mixedCell(names: readonly string[], ratio: number, base: ArenaConfig): CliCell {
  const chosen = names.map((name) => {
    const found = VARIANTS.find((v) => v.name === name);
    if (found === undefined) {
      throw new Error(`未知变体：${name}（可选：${VARIANTS.map((v) => v.name).join(',')}）`);
    }
    return found;
  });
  const merged: Record<string, unknown> = {};
  for (const variant of chosen) Object.assign(merged, variant.params);
  return {
    name: `mix(${names.join('+')})`,
    note: `组合：${chosen.map((v) => v.note).join('；')}`,
    configs: [base, merged as Partial<BotParams>],
    seatConfigs: seatConfigsFor(ratio),
    compare: { variant: 1, baseline: 0 },
    evidence: [...new Set(chosen.flatMap((v) => v.evidence))]
  };
}

/**
 * 把 `--baseline` 解析成「配置 0」。
 *
 * 默认是 `undefined`（= 当前出厂默认）。但**精细化调参**要问的是「A 与 B 谁强」这类任意配对 ——
 * 尤其「晋升前 vs 晋升后」「精调后的候选 vs 当前默认」，而 `undefined` 只能当其中一侧。
 * 只能写成变体的那一侧（配置 1）会把方向锁死，也会让「谁更贴人类陪练」这种对照写不出来。
 */
function baselineOf(name: string | undefined): ArenaConfig {
  if (name === undefined) return undefined;
  const found = VARIANTS.find((v) => v.name === name);
  if (found === undefined) {
    throw new Error(`未知 --baseline：${name}（可选：${VARIANTS.map((v) => v.name).join(',')}）`);
  }
  return found.params;
}

// ---------------------------------------------------------------------------
// 跑一个 cell
// ---------------------------------------------------------------------------

interface DeclarerStats {
  readonly variantDeals: number;
  readonly baselineDeals: number;
  readonly variantMade: number;
  readonly baselineMade: number;
  readonly variantMargin: number;
  readonly baselineMargin: number;
}

/**
 * 「谁先打完」的读数：整包的**胜负**判据是「2 人进度 ≥27 或 1 人 ≥40 即结束」（引擎 `scoreDeal`），
 * 所以冠军归属是比「每座位平均进度」更贴近真实胜负的量。
 *
 * 两个配比的公平份额不同（1 变体 + 2 基线时是 1/3，反过来是 2/3），所以份额必须与
 * `fairShare` 并排读 —— 单看「变体拿了几成冠军」会被座位数骗过去。
 */
interface FinishStats {
  readonly finished: number;
  readonly games: number;
  /** 变体座位里有人拿到**唯一**最高进度的局数 */
  readonly variantFirst: number;
  readonly baselineFirst: number;
  /** 变体与基线座位并列最高的局数（不算给任何一方） */
  readonly ties: number;
  /** 变体座位占全部座位的比例（公平份额） */
  readonly fairShare: number;
}

interface CellResult {
  readonly cell: CliCell;
  readonly effect: ClusterEffect;
  /**
   * **空转**：这个 cell 的变体配置解析之后与基线**逐字相同**（例如某变体已经被晋升成默认值）。
   * 这时 Δ 必然恒等于 0、p 恒等于 1 —— 那不是「没有效果」，而是「根本没换配置」。
   * 两者在表里长得一模一样，所以必须显式标出来（晋升之后最容易踩这个坑）。
   */
  readonly noop: boolean;
  /** 本 cell 的**种子均值离散度** σ(D_s)：配对功效估算的分母（A/A cell 恒为 0，退化） */
  readonly sd: number;
  readonly counters: { readonly variant: DealCounters; readonly baseline: DealCounters };
  readonly seatDeals: { readonly variant: number; readonly baseline: number };
  readonly declarer: DeclarerStats;
  readonly finish: FinishStats;
  readonly redeals: number;
  readonly unreached: number;
  readonly samples: number;
  readonly diffs: readonly (readonly number[])[];
}

/** 这个 cell 的变体配置与基线是否解析成同一套参数（= 空转，见 `CellResult.noop`） */
function isNoop(cell: CliCell): boolean {
  const variant = paramsOf(cell.configs[cell.compare.variant]);
  const baseline = paramsOf(cell.configs[cell.compare.baseline]);
  return JSON.stringify(variant) === JSON.stringify(baseline);
}

type AnyRecord = DealRecord | GameRecord;

const summariesOf = (record: AnyRecord): readonly { contract: { declarerSeat: number; points: number }; finalScore: number; made: boolean }[] =>
  'summary' in record ? (record.summary === null ? [] : [record.summary]) : record.summaries;

const valuePerSeat = (record: AnyRecord, config: number): number | null =>
  'summary' in record ? improvementPerSeat(record, config) : progressPerSeat(record, config);

function seatDealsOf(records: readonly AnyRecord[], config: number): number {
  let total = 0;
  for (const record of records) {
    for (const seat of [0, 1, 2]) if (record.configOfSeat[seat] === config) total += 1;
  }
  return total;
}

function declarerStats(records: readonly AnyRecord[]): DeclarerStats {
  const acc = {
    variantDeals: 0,
    baselineDeals: 0,
    variantMade: 0,
    baselineMade: 0,
    variantMargin: 0,
    baselineMargin: 0
  };
  for (const record of records) {
    for (const summary of summariesOf(record)) {
      const config = record.configOfSeat[summary.contract.declarerSeat];
      const bucket = config === 1 ? 'variant' : config === 0 ? 'baseline' : null;
      if (bucket === null) continue;
      acc[`${bucket}Deals`] += 1;
      acc[`${bucket}Margin`] += summary.finalScore - summary.contract.points;
      if (summary.made) acc[`${bucket}Made`] += 1;
    }
  }
  return acc;
}

/** 整局台专属：终局最高进度落在谁手里（见 `FinishStats`） */
function finishStats(records: readonly AnyRecord[], variant: number, baseline: number): FinishStats {
  let games = 0;
  let finished = 0;
  let variantFirst = 0;
  let baselineFirst = 0;
  let ties = 0;
  let variantSeats = 0;
  let seats = 0;
  for (const record of records) {
    if (!('progress' in record)) continue;
    games += 1;
    if (record.status === 'finished') finished += 1;
    const top = Math.max(...record.progress);
    const isTop = (seat: number): boolean => record.progress[seat] === top;
    const tag = (seat: number): 'variant' | 'baseline' | 'other' =>
      record.configOfSeat[seat] === variant ? 'variant' : record.configOfSeat[seat] === baseline ? 'baseline' : 'other';
    for (const seat of [0, 1, 2]) {
      seats += 1;
      if (tag(seat) === 'variant') variantSeats += 1;
    }
    const variantHas = [0, 1, 2].some((seat) => isTop(seat) && tag(seat) === 'variant');
    const baselineHas = [0, 1, 2].some((seat) => isTop(seat) && tag(seat) === 'baseline');
    if (variantHas && baselineHas) ties += 1;
    else if (variantHas) variantFirst += 1;
    else if (baselineHas) baselineFirst += 1;
  }
  return {
    finished,
    games,
    variantFirst,
    baselineFirst,
    ties,
    fairShare: seats === 0 ? 0 : variantSeats / seats
  };
}

function runCell(
  cell: CliCell,
  mode: 'deal' | 'game',
  seeds: readonly number[],
  rotations: number,
  statsRng: () => number
): CellResult {
  const assign = assignFrom(cell.seatConfigs);
  const records: readonly AnyRecord[] =
    mode === 'deal'
      ? runDealCell({ seeds, rotations, assign, configs: cell.configs, rngFactory })
      : runGameCell({ seeds, rotations, assign, configs: cell.configs, rngFactory });

  const diffs = pairedBySeed(
    records,
    (record) => ({ seed: record.seed, rotation: record.rotation }),
    valuePerSeat,
    cell.compare.variant,
    cell.compare.baseline
  );

  return {
    cell,
    effect: clusterEffect(diffs, statsRng),
    noop: isNoop(cell),
    sd: clusterSd(diffs),
    counters: {
      variant: countersOfConfig(records, cell.compare.variant),
      baseline: countersOfConfig(records, cell.compare.baseline)
    },
    seatDeals: {
      variant: seatDealsOf(records, cell.compare.variant),
      baseline: seatDealsOf(records, cell.compare.baseline)
    },
    declarer: declarerStats(records),
    finish: finishStats(records, cell.compare.variant, cell.compare.baseline),
    redeals: records.reduce((sum, record) => sum + record.redeals, 0),
    unreached: records.filter((record) => 'summary' in record && record.unreached).length,
    samples: records.length,
    diffs
  };
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------

const fmt = (value: number, digits = 3): string => (Number.isFinite(value) ? value.toFixed(digits) : '∞');

/** 每 100 个座位-副的计数（1:2 与 2:1 的座位数不同，不归一就没法比） */
const per100 = (count: number, seatDeals: number): number => (seatDeals === 0 ? 0 : (count / seatDeals) * 100);

function markdownReport(
  results: readonly CellResult[],
  mode: string,
  seeds: number,
  rotations: number,
  ratio: number,
  alpha: number
): string {
  // Holm 的家族只算**真变体**：A/A 是标定 cell（p 恒为 1），把它算进 m 只会无谓加重校正
  const family = results.filter((result) => result.cell.name !== 'A/A');
  const familyRejected = holmBonferroni(family.map((result) => result.effect.pValue), alpha);
  const rejected = new Map(family.map((result, index) => [result, familyRejected[index]!]));
  const lines: string[] = [];
  lines.push(`# 机器人参数竞技场（${mode === 'deal' ? '单副台' : '整局台'}）`);
  lines.push('');
  lines.push(
    `种子 1..${seeds} × 轮换 ${rotations} × 座位配比 ${ratio === 2 ? '2 变体 + 1 基线' : '1 变体 + 2 基线'}；` +
      `配对单位 = 种子；读数 = ${mode === 'deal' ? '每座位每副升级数' : '每座位终局进度'}（变体 − 基线）；` +
      `检验 = 符号翻转置换（双侧）+ Holm–Bonferroni（α=${alpha}）；` +
      `MDE = 2.8·σ(D_s)/√N，σ 取本 cell 的种子均值离散度（A/A 恒为 0、故不给 MDE）`
  );
  lines.push('');
  lines.push('| cell | 说明 | Δ每座位 | 95% CI | p | Holm 显著 | 单位/样本 | MDE |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  results.forEach((result, index) => {
    const e = result.effect;
    const mde = result.cell.name === 'A/A' ? '—' : `±${fmt(minimumDetectable(result.sd, e.units), 4)}`;
    // A/A 本身就是「两侧同配置」，那不是空转、是标定；空转指的是**别的**细胞不小心变成了同配置
    const note =
      result.noop && result.cell.name !== 'A/A'
        ? `**空转**（与基线同参数）：${result.cell.note}`
        : result.cell.note;
    lines.push(
      `| ${result.cell.name} | ${note} | ${fmt(e.mean, 4)} | [${fmt(e.ciLow, 4)}, ${fmt(e.ciHigh, 4)}] | ` +
        `${fmt(e.pValue, 4)} | ${rejected.get(result) === true ? '**是**' : '否'} | ${e.units}/${e.samples} | ${mde} |`
    );
  });
  lines.push('');

  lines.push('## 机制证据（每 100 座位-副的计数；证明开关真的接线了）');
  lines.push('');
  lines.push('| cell | 计数 | 变体 | 基线 | 比值 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const result of results) {
    if (result.cell.evidence.length === 0) continue;
    for (const key of result.cell.evidence) {
      const v = per100(result.counters.variant[key], result.seatDeals.variant);
      const b = per100(result.counters.baseline[key], result.seatDeals.baseline);
      const ratioText = b === 0 ? (v === 0 ? '1.00' : '∞') : fmt(v / b, 2);
      lines.push(`| ${result.cell.name} | ${key} | ${fmt(v, 2)} | ${fmt(b, 2)} | ${ratioText} |`);
    }
  }
  lines.push('');

  lines.push('## 庄家侧与桌况');
  lines.push('');
  lines.push('| cell | 变体做庄：副数/打成/分差均值 | 基线做庄：副数/打成/分差均值 | 重发 | 未打成 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const result of results) {
    const d = result.declarer;
    const line = (deals: number, made: number, margin: number): string =>
      deals === 0 ? '—' : `${deals} / ${((made / deals) * 100).toFixed(1)}% / ${(margin / deals).toFixed(2)}`;
    lines.push(
      `| ${result.cell.name} | ${line(d.variantDeals, d.variantMade, d.variantMargin)} | ` +
        `${line(d.baselineDeals, d.baselineMade, d.baselineMargin)} | ${result.redeals} | ${result.unreached} |`
    );
  }
  lines.push('');

  if (results.some((result) => result.finish.games > 0)) {
    lines.push('## 谁先打完（整局台的胜负判据：2 人 ≥27 或 1 人 ≥40 即结束）');
    lines.push('');
    lines.push('| cell | 变体先打完 | 基线先打完 | 并列 | 变体份额 | 公平份额 | 打完的局 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const result of results) {
      const f = result.finish;
      const decided = f.variantFirst + f.baselineFirst;
      const share = decided === 0 ? 0 : f.variantFirst / decided;
      lines.push(
        `| ${result.cell.name} | ${f.variantFirst} | ${f.baselineFirst} | ${f.ties} | ` +
          `${(share * 100).toFixed(1)}% | ${(f.fairShare * 100).toFixed(1)}% | ${f.finished}/${f.games} |`
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const one = (key: string): string | undefined => args.get(key)?.[0];
  const mode = (one('mode') ?? 'deal') === 'game' ? 'game' : 'deal';
  const seeds = Number(one('seeds') ?? 1000);
  const rotations = Number(one('rotations') ?? 3);
  const ratio = Number(one('ratio') ?? 1);
  const alpha = Number(one('alpha') ?? 0.05);
  const only = (one('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const mixes = (args.get('mix') ?? []).map((value) =>
    value.split(',').map((s) => s.trim()).filter(Boolean)
  );
  const calibrate = (one('calibrate') ?? '1') !== '0';
  const outPath = resolve(repoRoot, one('out') ?? `data/_analysis/arena/${mode}-latest.json`);
  const reportArg = one('report');
  const reportPath = reportArg === undefined ? undefined : resolve(repoRoot, reportArg);

  const base = baselineOf(one('baseline'));
  const selected = VARIANTS.filter((v) => only.length === 0 || only.includes(v.name));
  if (selected.length === 0 && mixes.length === 0) throw new Error('没有选中的变体（检查 --only）');

  const cells: CliCell[] = [];
  if (calibrate) cells.push(aaCell(ratio, base));
  for (const variant of selected) cells.push(variantCell(variant, ratio, base));
  for (const names of mixes) cells.push(mixedCell(names, ratio, base));

  // `--seed0` 偏移种子区间：**复现实验**要用没跑过的那一段（换个种子重跑一遍才叫复现，
  // 在同一批种子上重跑只是把同一份数字再算一遍）。
  const seed0 = Number(one('seed0') ?? 1);
  const seedList = Array.from({ length: seeds }, (_, i) => seed0 + i);
  // 轮换必须是 3 的倍数：座位偏差靠「每个座位都当过一次变体」抵消，
  // 少转一圈就有座位永远坐不到变体那侧，A/A 也不再恒为 0（踩过：rotations=2 时 A/A Δ=−0.006）。
  if (rotations % 3 !== 0) {
    console.log(`⚠ rotations=${rotations} 不是 3 的倍数：座位偏差抵消不干净，A/A 不再恒等于 0`);
  }
  console.log(
    `竞技场：mode=${mode} seeds=${seeds} rotations=${rotations} ratio=${ratio} cells=${cells.length}`
  );

  const started = Date.now();
  const results: CellResult[] = [];
  cells.forEach((cell, index) => {
    const cellStart = Date.now();
    // 每个 cell 用**固定**的统计随机流：同一份数据 ⇒ 同一份 CI 与 p 值（报告可复现）
    const result = runCell(cell, mode, seedList, rotations, mulberry32(20261006 + index));
    results.push(result);
    const e = result.effect;
    const flag = result.noop && cell.name !== 'A/A' ? '  ⚠ 空转（与基线同参数，Δ 必为 0）' : '';
    console.log(
      `  ${cell.name.padEnd(18)} Δ=${fmt(e.mean, 4)} CI=[${fmt(e.ciLow, 4)},${fmt(e.ciHigh, 4)}] ` +
        `p=${fmt(e.pValue, 4)} (${((Date.now() - cellStart) / 1000).toFixed(1)}s)${flag}`
    );
  });
  const noops = results.filter((result) => result.noop && result.cell.name !== 'A/A');
  if (noops.length > 0) {
    console.log(
      `⚠ ${noops.length} 个 cell 是空转（${noops.map((r) => r.cell.name).join('、')}）：` +
        '它们的变体配置解析后与当前基线逐字相同 —— 多半是这些开关**已经被晋升成默认值**了。' +
        '要重新量它们，得把历史值显式写成变体（目录里的 legacy-baseline 就是这个用途）。'
    );
  }
  console.log(`完成：${cells.length} cells / ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const report = markdownReport(results, mode, seeds, rotations, ratio, alpha);
  console.log('');
  console.log(report);

  const payload = {
    mode,
    seeds,
    rotations,
    ratio,
    seed0,
    alpha,
    // 逐字记下这一轮用的是哪套「基线」：缺省参数以后会随晋升而变，
    // 没有这份快照，报告里的数字就无法复现（cells 里的 `undefined` 只有配合它才有意义）。
    baseline: BASELINE_PARAMS,
    note: 'diffs = 每个种子的 (变体 − 基线) 观测数组（配对单位是种子，数组内是轮换）',
    cells: cells.map((cell) => ({
      name: cell.name,
      note: cell.note,
      configs: cell.configs,
      seatConfigs: cell.seatConfigs,
      compare: cell.compare
    })),
    results: results.map((result) => ({
      name: result.cell.name,
      note: result.cell.note,
      noop: result.noop,
      effect: result.effect,
      sd: result.sd,
      mde: minimumDetectable(result.sd, result.effect.units),
      counters: result.counters,
      seatDeals: result.seatDeals,
      declarer: result.declarer,
      finish: result.finish,
      redeals: result.redeals,
      unreached: result.unreached,
      diffs: result.diffs
    }))
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`原始结果：${outPath}`);
  if (reportPath !== undefined) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${report}\n`, 'utf8');
    console.log(`报告：${reportPath}`);
  }
}

main();
