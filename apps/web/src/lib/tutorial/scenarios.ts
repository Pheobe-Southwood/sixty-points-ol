/**
 * 新手教程的示例牌面与示例数值（纯数据）。
 *
 * 关键约束：这里所有示例的「正确性」都由引擎自己的纯函数在 test/tutorial.test.ts 里验证
 * （validateLead / validateFollow / trickWinner / classOfSet / cardsPoints / madeLevels），
 * 所以规则引擎改动后教程不会悄悄变成错的。
 */

import {
  cardKey,
  fullDeck,
  type BidCall,
  type Card,
  type Level,
  type Seat,
  type TrumpModel
} from '@sixty/engine';

/** 示例统一用「本副级牌 = 5」 */
export const LEVEL = 5;
/** 有主：主打 ♥ */
export const TRUMP_HEARTS: TrumpModel = { strain: 'H', rank: LEVEL };
/** 无主：四张级牌与双王是主牌 */
export const TRUMP_NT: TrumpModel = { strain: 'NT', rank: LEVEL };
/** 有主：主打 ♣（用于对照「主花色」换一个门） */
export const TRUMP_CLUBS: TrumpModel = { strain: 'C', rank: LEVEL };

/** 教程里出现的示例都在这个将牌环境下：文案里的「本副：…」直接渲染它 */
export const DEMO_TRUMP = TRUMP_HEARTS;

/** 教程里三个座位的代称；座位号与真实牌局一致（0/1/2） */
export const TUTORIAL_NAMES = ['你', '阿豪', '小美'] as const;

const DECK: ReadonlyMap<string, Card> = new Map(fullDeck().map((card) => [cardKey(card), card]));

/** 写教程时用 J/Q/K/A 比 11/12/13/14 可读；`cardKey` 本身用数字 */
const RANK_ALIAS: Readonly<Record<string, number>> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };

function normalizeKey(key: string): string {
  if (key.startsWith('j')) return key.toLowerCase();
  const suit = key.slice(0, 1).toUpperCase();
  const rest = key.slice(1).toUpperCase();
  return `${suit}${RANK_ALIAS[rest] ?? Number(rest)}`;
}

function lookup(key: string): Card {
  const card = DECK.get(normalizeKey(key));
  if (card === undefined) throw new Error(`教程牌面键不存在：${key}`);
  return card;
}

/** `handOf('H5', 'C10', 'SK', 'j1')` → 四张牌；键写错直接抛错，避免示例里混进不存在的牌 */
export function handOf(...keys: string[]): Card[] {
  return keys.map(lookup);
}

/** 把一组键换成牌（给测试核对反例用） */
export function cardsOf(keys: readonly string[]): Card[] {
  return handOf(...keys);
}

/* ---------- 1. 分值 ---------- */

export const POINT_CARDS = handOf('H5', 'D10', 'SK', 'j0', 'j1');

export const POINT_ROWS: readonly { readonly label: string; readonly points: number }[] = [
  { label: '5', points: 5 },
  { label: '10', points: 10 },
  { label: 'K', points: 10 },
  { label: '其余（含双王）', points: 0 }
];

/* ---------- 2. 级牌与主牌 ---------- */

/** 同一组牌在「主打 ♥」与「无主」两种模型下的分类完全不同：金边即主牌 */
export const TRUMP_DEMO_CARDS = handOf('H2', 'H10', 'H5', 'S5', 'C5', 'D5', 'S10', 'C9', 'j0', 'j1');

/** 主牌全序：主花色小牌 < 副级（三张相等）< 主级 < 小王 < 大王 */
export const TRUMP_LADDER = handOf('H2', 'H3', 'S5', 'H5', 'j0', 'j1');

/* ---------- 3. 叫牌 ---------- */

/** 一段完整成交的叫牌：你 40♣ → 阿豪 45♥ → 小美不叫 → 你不叫 ⇒ 阿豪坐庄、主打 ♥ */
export const DEMO_AUCTION: readonly { readonly seat: Seat; readonly call: BidCall }[] = [
  { seat: 0, call: { points: 40, strain: 'C' } },
  { seat: 1, call: { points: 45, strain: 'H' } },
  { seat: 2, call: 'pass' },
  { seat: 0, call: 'pass' }
];

/** 上面这段叫牌的结论，用于文案与测试对齐 */
export const DEMO_CONTRACT = { points: 45, strain: 'H', declarerSeat: 1 as Seat };

/**
 * 定约 45♥、示例暗底 10 分、末轮每人 2 张时，闲家到底要抓多少分。
 * 数值由 settle.ts 算出来，页面直接渲染——教程里不再手写「100 − 45 = 55」这种漏掉底牌的算式。
 */
export const DEMO_SETTLE_INPUT = { contract: DEMO_CONTRACT.points, kittyPoints: 10, multiplier: 2 } as const;

/** 「叫法的意图」表：把价格与承担的责任对上 */
export const AUCTION_INTENTS: readonly {
  readonly call: string;
  readonly intent: string;
}[] = [
  { call: '40 起步叫', intent: '有牌但想便宜拿下：把决定权交给对手，代价是收益也小' },
  { call: '45 - 55 加叫', intent: '真有牌且愿意承担；同时在逼对手判断你是抢庄还是诈唬' },
  { call: '60 以上跳叫', intent: '要么极限强牌，要么就是赌对手不敢接的阻击' }
];

/* ---------- 4. 埋底与结算 ---------- */

/** 庄家手牌示意（真实为 20 张，这里取 12 张展示扇形） */
export const BURY_HAND = handOf('H2', 'H3', 'H4', 'H6', 'H10', 'HK', 'S9', 'SJ', 'SQ', 'C8', 'C9', 'C10');

/** 示例暗底：♥5 + ♦5 + ♠7 = 10 分 */
export const DEMO_KITTY = handOf('H5', 'D5', 'S7');

/** 一条算式的示例数值：墩分 55 + 底牌 10 × 末轮 2 张 = 75，定约 70 ⇒ 打成 3 级 */
export const KITTY_EQUATION = {
  contract: 70,
  trickPoints: 55,
  kittyPoints: 10,
  multiplier: 2,
  madeFinal: 75,
  setFinal: 35
} as const;

export const MULTIPLIER_ROWS: readonly { readonly lastTrick: string; readonly multiplier: number }[] = [
  { lastTrick: '末轮每家 1 张', multiplier: 1 },
  { lastTrick: '末轮每家 2 张', multiplier: 2 },
  { lastTrick: '末轮每家 3 张', multiplier: 3 }
];

/* ---------- 5. 打牌：三个练手示例 ---------- */

export interface TryPlayDemo {
  readonly id: string;
  readonly title: string;
  readonly task: string;
  readonly trump: TrumpModel;
  readonly hand: readonly Card[];
  /** null = 由你领出 */
  readonly lead: readonly Card[] | null;
  /** 文档化的正例/反例（牌面键），仅测试使用；组件本身只调用引擎校验 */
  readonly legal: readonly (readonly string[])[];
  readonly illegal: readonly (readonly string[])[];
}

/** 练手 1：领出——单张、同门顺子都行，混门/不连不行 */
export const TRY_LEAD: TryPlayDemo = {
  id: 'lead',
  title: '练手 1 · 领出',
  task: '你领出（本副级牌 5、主打 ♥）。试着点选牌面：单张、或同门顺子都合法；混门、不相邻都不行。',
  trump: TRUMP_HEARTS,
  hand: handOf('S9', 'S10', 'SJ', 'SQ', 'H2', 'H3', 'C6', 'D8'),
  lead: null,
  legal: [
    ['S9'],
    ['S9', 'S10', 'SJ', 'SQ'],
    ['H2', 'H3']
  ],
  illegal: [
    ['S9', 'SJ'],
    ['S9', 'S10', 'SJ', 'SQ', 'H2'],
    ['C6', 'D8']
  ]
};

/** 练手 2：跟牌——该门够张数时必须全出该门，且结构优先（3 顺 + 1 > 2 顺 + 2） */
export const TRY_FOLLOW: TryPlayDemo = {
  id: 'follow',
  title: '练手 2 · 跟牌（结构优先）',
  task: '上家领出 ♣8-9-10-J 四张顺子。你手里 ♣ 有 3 顺（3-4-6，级牌 5 不在这一门）+ 2 顺（Q-K），该怎么跟？',
  trump: TRUMP_HEARTS,
  hand: handOf('C3', 'C4', 'C6', 'CQ', 'CK', 'S9', 'H2'),
  lead: handOf('C8', 'C9', 'C10', 'CJ'),
  legal: [
    ['C3', 'C4', 'C6', 'CQ'],
    ['C3', 'C4', 'C6', 'CK']
  ],
  illegal: [
    ['CQ', 'CK', 'C3', 'C4'],
    ['C3', 'C4', 'C6', 'S9']
  ]
};

/** 练手 3：缺门——可以杀牌（能赢）也可以垫牌（不能赢） */
export const TRY_RUFF: TryPlayDemo = {
  id: 'ruff',
  title: '练手 3 · 缺门杀牌',
  task: '上家领出 ♠7-8-9 三张顺子，你手里一张 ♠ 都没有。出主牌顺子能赢下这轮，垫牌不能。',
  trump: TRUMP_HEARTS,
  hand: handOf('H3', 'H4', 'H6', 'C2', 'C3', 'D4'),
  lead: handOf('S7', 'S8', 'S9'),
  legal: [
    ['H3', 'H4', 'H6'],
    ['C2', 'C3', 'D4']
  ],
  illegal: [['H3', 'H4']]
};

export const TRY_DEMOS: readonly TryPlayDemo[] = [TRY_LEAD, TRY_FOLLOW, TRY_RUFF];

/* ---------- 6. 打牌推论里的静态示例 ---------- */

/** 副牌顺子跳过级牌：级牌 5 归主牌，所以 ♣3-4-6 是连着的 */
export const RUN_SKIPS_LEVEL = handOf('C3', 'C4', 'C6');
/** 反例：同门但不相邻（♣3 与 ♣9） */
export const RUN_NOT_ADJACENT = handOf('C3', 'C9');
/** 主牌顺子按主牌全序相邻：♥3-4-6（级牌 ♥5 归主级，位于更高层） */
export const TRUMP_RUN = handOf('H3', 'H4', 'H6');
/** 副级三张完全相等，彼此不构成顺子相邻 */
export const OFF_RANK_EQUALS = handOf('S5', 'C5', 'D5');

/** 主牌顺子压过副牌顺子：♠A-K-Q 被最低的三张主牌顺子杀掉 */
export const RUFF_LEAD = handOf('SA', 'SK', 'SQ');
export const RUFF_WINNER = handOf('H2', 'H3', 'H4');

/* ---------- 7. 级别与升级表 ---------- */

export const LEVEL_DEMO: readonly Level[] = [
  { rank: 5, cycle: 0 },
  { rank: 14, cycle: 1 },
  { rank: 5, cycle: 2 }
];

/**
 * 庄家升级档。`max: null` 表示「下限起、每多 5 分再 1 级」。
 *
 * 只列**真实会出现的**区间：得分来自 5/10/K，永远是 5 的倍数，
 * 所以 59 / 69 / 79 / 89 这类边界不可达，写成 40-59 只是照抄引擎整数阈值、对玩家没有意义。
 * 用数值上下限而不是字符串，才能让测试遍历并和 madeLevels 对齐。
 */
export interface UpgradeBand {
  readonly min: number;
  readonly max: number | null;
  /** 该档的升级级数；`max: null` 的那档是下限，实际为 5 + (得分 − 90) / 5 */
  readonly levels: number;
  /** 表格里显示的文案 */
  readonly label: string;
}

export const UPGRADE_BANDS: readonly UpgradeBand[] = [
  { min: 40, max: 55, levels: 1, label: '1 级' },
  { min: 60, max: 65, levels: 2, label: '2 级' },
  { min: 70, max: 75, levels: 3, label: '3 级' },
  { min: 80, max: 85, levels: 4, label: '4 级' },
  { min: 90, max: null, levels: 5, label: '5 级起，每多 5 分再 1 级' }
];

/** 表格显示用：可达区间 + 该档实际会出现的分数 */
export const UPGRADE_ROWS: readonly { readonly range: string; readonly sample: number; readonly levels: string }[] =
  UPGRADE_BANDS.map((band) => ({
    range: band.max === null ? `≥ ${band.min}` : `${band.min} / ${band.max}`,
    sample: band.min,
    levels: band.label
  }));

/** 打输时闲家升级：差 = 定约 − 最终得分，各升 ceil(差 / 10) */
export const DEFENDER_STEPS: readonly { readonly shortfall: number; readonly levels: number }[] = [
  { shortfall: 5, levels: 1 },
  { shortfall: 10, levels: 1 },
  { shortfall: 15, levels: 2 },
  { shortfall: 20, levels: 2 },
  { shortfall: 25, levels: 3 },
  { shortfall: 30, levels: 3 },
  { shortfall: 35, levels: 4 },
  { shortfall: 50, levels: 5 }
];

/** 升级就是「从当前级别往前推进 N 级」：A 之后进 2(+1)，换档时轮数 +1 */
export const LEVEL_STEPS: readonly {
  readonly from: Level;
  readonly levels: number;
  readonly to: Level;
  readonly note: string;
}[] = [
  { from: { rank: 5, cycle: 0 }, levels: 3, to: { rank: 8, cycle: 0 }, note: '同档内推进' },
  { from: { rank: 14, cycle: 0 }, levels: 2, to: { rank: 3, cycle: 1 }, note: 'A 之后进 2(+1)' }
];
