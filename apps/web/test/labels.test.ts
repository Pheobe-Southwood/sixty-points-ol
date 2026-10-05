/**
 * 叫品显示单测：界面上叫品一律写「分数 + 花色字形」。
 *
 * 被修掉的缺陷：叫牌历史走引擎的 `bidLabel`，页面上打着 `40 梅花`、`45 梅花`……
 * 而同一屏的候选按钮用的是 `strainGlyph`（♣）—— 同一种东西两种写法。
 * 这里把「不许出现裸花色字母」钉成回归。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STRAINS,
  type BidEntry,
  type Card,
  type DealSummary,
  type Level,
  type PersonalView
} from '@sixty/engine';

import {
  BID_GLYPH,
  bidText,
  callText,
  followSuitCards,
  formatElapsed,
  highestCall,
  isRedStrain,
  kittyHandDelta,
  kittySign,
  lastCall,
  levelRows,
  scoreLineText,
  trickSideBadge
} from '../src/lib/labels.ts';

/** 只关心叫牌历史的个人视图；其余字段填最小可用值 */
function viewWithAuction(auction: readonly BidEntry[]): PersonalView {
  return {
    version: 1,
    status: 'playing',
    dealerSeat: 0,
    dealNo: 1,
    levels: [],
    progress: [],
    result: null,
    history: [],
    deal: {
      phase: 'auction',
      dealNo: 1,
      dealerSeat: 0,
      auction,
      highestBid: null,
      auctionTurn: 0,
      contract: null,
      trump: null,
      trick: null,
      playTurn: null,
      trickHistory: [],
      captured: [],
      handCounts: [17, 17, 17],
      declarerSeat: null,
      summary: null
    },
    // 两批底牌都属于玩家私有，挂在 you 上（`deal` 是观战者也拿得到的公共投影）
    you: { seat: 0, hand: [], isDeclarer: false, originalKitty: null, buriedKitty: null }
  };
}

test('bidText：不叫用文字，叫品用「分数 + 花色字形」', () => {
  assert.equal(bidText('pass'), '不叫');
  assert.equal(bidText({ points: 40, strain: 'C' }), '40♣');
  assert.equal(bidText({ points: 45, strain: 'D' }), '45♦');
  assert.equal(bidText({ points: 80, strain: 'H' }), '80♥');
  assert.equal(bidText({ points: 100, strain: 'S' }), '100♠');
  assert.equal(bidText({ points: 60, strain: 'NT' }), '60无主');
});

test('回归：叫品文本里不许出现裸花色字母（C/D/H/S/NT）', () => {
  for (const strain of STRAINS) {
    const text = bidText({ points: 40, strain });
    assert.equal(
      /[CDHSNT]/.test(text),
      false,
      `${strain} 的叫品文本里还有裸字母：${text}（应走 strainGlyph）`
    );
  }
});

test('callText 是 bidText 的别名，两处不会再各写一份', () => {
  assert.equal(callText({ points: 40, strain: 'C' }), bidText({ points: 40, strain: 'C' }));
  assert.equal(callText('pass'), '不叫');
});

test('BID_GLYPH：五个花色都有字形，无主用文字，红色只给 ♦♥', () => {
  for (const strain of STRAINS) {
    assert.equal(typeof BID_GLYPH[strain], 'string');
    assert.ok(BID_GLYPH[strain].length > 0, `${strain} 没有字形`);
  }
  assert.deepEqual(
    STRAINS.map((s) => BID_GLYPH[s]),
    ['♣', '♦', '♥', '♠', '无主']
  );
  // 裸字母不该出现在任何字形里
  for (const strain of STRAINS) assert.equal(/[CDHSNT]/.test(BID_GLYPH[strain]), false);
  assert.deepEqual(
    STRAINS.map((s) => isRedStrain(s)),
    [false, true, true, false, false]
  );
});

test('lastCall / highestCall：大字要的是最高叫品，「不叫」只进历史', () => {
  const empty = viewWithAuction([]);
  assert.equal(lastCall(empty), null);
  assert.equal(highestCall(empty), null);

  const onlyPass = viewWithAuction([{ seat: 0, call: 'pass' }]);
  assert.equal(lastCall(onlyPass), 'pass');
  assert.equal(highestCall(onlyPass), null, '全是 pass 时没有最高叫品');

  const mixed = viewWithAuction([
    { seat: 0, call: { points: 40, strain: 'C' } },
    { seat: 1, call: { points: 50, strain: 'H' } },
    { seat: 2, call: 'pass' },
    { seat: 0, call: 'pass' }
  ]);
  assert.equal(lastCall(mixed), 'pass', '最后一次出手是「不叫」');
  assert.deepEqual(highestCall(mixed), { points: 50, strain: 'H' }, '最高叫品要跳过末尾的 pass');
});

test('kittyHandDelta：只取手牌里来自底牌的牌，张数按多重集合算', () => {
  const kitty: Card[] = [
    { suit: 'S', rank: 5 },
    { suit: 'H', rank: 10 },
    { suit: 'C', rank: 2 }
  ];
  const hand: Card[] = [
    { suit: 'S', rank: 5 },
    { suit: 'H', rank: 10 },
    { suit: 'C', rank: 2 },
    { suit: 'D', rank: 7 }
  ];

  assert.deepEqual(
    kittyHandDelta(hand, kitty).map((c) => JSON.stringify(c)),
    kitty.map((c) => JSON.stringify(c)),
    '三张底牌都应在手牌里被标出'
  );
  assert.deepEqual(kittyHandDelta(hand, null), [], '闲家（originalKitty 为 null）不标任何牌');
  assert.deepEqual(kittyHandDelta(hand, []), []);
});

test('kittyHandDelta：同点同花的重牌不会多标（多重集合语义）', () => {
  const kitty: Card[] = [{ suit: 'S', rank: 5 }];
  const hand: Card[] = [{ suit: 'S', rank: 5 }];
  assert.equal(kittyHandDelta(hand, kitty).length, 1);
  // 手牌里没有底牌时返回空
  assert.deepEqual(kittyHandDelta([{ suit: 'D', rank: 3 }], kitty), []);
});

test('formatElapsed：秒 / 分秒 / 小时分三档，坏输入一律当 0', () => {
  // 秒档：不足一分钟只写秒
  assert.equal(formatElapsed(0), '0 秒');
  assert.equal(formatElapsed(999), '0 秒', '不足一秒向下取整，不显示小数');
  assert.equal(formatElapsed(1_000), '1 秒');
  assert.equal(formatElapsed(59_999), '59 秒', '59.999 秒还不满一分钟，不许进位成「1 分」');
  // 分秒档：秒补零，走字时宽度不跳
  assert.equal(formatElapsed(60_000), '1 分 00 秒');
  assert.equal(formatElapsed(65_400), '1 分 05 秒');
  assert.equal(formatElapsed(3_599_000), '59 分 59 秒');
  // 小时档：到小时就不再写秒（牌桌上没人读「1 小时 02 分 03 秒」）
  assert.equal(formatElapsed(3_600_000), '1 小时 00 分');
  assert.equal(formatElapsed(7_380_000), '2 小时 03 分');
  assert.equal(formatElapsed(90_000_000), '25 小时 00 分');
  // 坏输入：牌面上绝不出现负数或 NaN
  assert.equal(formatElapsed(-1), '0 秒');
  assert.equal(formatElapsed(Number.NaN), '0 秒');
  assert.equal(formatElapsed(Number.POSITIVE_INFINITY), '0 秒');
});

test('trickSideBadge：只说这 N 分归庄方还是闲方', () => {  // 庄家座位 2 赢了这一墩 → 庄；其余两个座位都是闲家一方 → 闲
  assert.equal(trickSideBadge(2, 2, 20), '庄 +20 分');
  assert.equal(trickSideBadge(2, 0, 5), '闲 +5 分');
  assert.equal(trickSideBadge(2, 1, 0), '闲 +0 分', '0 分的墩也要如实报（不写成「赢墩 +0」）');
  assert.equal(
    trickSideBadge(null, 1, 10),
    '闲 +10 分',
    '定约未定时不该抛错：没有庄家就没有庄方'
  );
});

test('followSuitCards：只标领出那一门，领出与缺门都是空集', () => {
  const trump = { strain: 'H', rank: 5 } as const;
  const hand: Card[] = [
    { suit: 'S', rank: 3 },
    { suit: 'C', rank: 9 },
    { suit: 'S', rank: 14 },
    { suit: 'D', rank: 2 }
  ];

  // 领出 ♠3：手上两张 ♠ 都该标（跟牌必须先跟这一门）
  assert.deepEqual(
    followSuitCards(hand, trump, { plays: [{ cards: [{ suit: 'S', rank: 3 }] }] }).map((c) =>
      JSON.stringify(c)
    ),
    [JSON.stringify({ suit: 'S', rank: 3 }), JSON.stringify({ suit: 'S', rank: 14 })],
    '领出 ♠ 时应标出手上所有 ♠'
  );

  // 领出（还没人出牌）：没有「同一门」可跟
  assert.deepEqual(followSuitCards(hand, trump, { plays: [] }), [], '领出时不该有标记');
  assert.deepEqual(followSuitCards(hand, trump, null), [], '没有墩信息时不该有标记');

  // 缺门：手上这一门只剩一张 → 只标那一张
  assert.deepEqual(
    followSuitCards(hand, trump, { plays: [{ cards: [{ suit: 'D', rank: 9 }] }] }).map((c) =>
      JSON.stringify(c)
    ),
    [JSON.stringify({ suit: 'D', rank: 2 })],
    '手上只有一张 ♦ 时只标那一张'
  );
  assert.deepEqual(
    followSuitCards([{ suit: 'C', rank: 3 }], trump, { plays: [{ cards: [{ suit: 'D', rank: 9 }] }] }),
    [],
    '完全缺门时是空集'
  );

  // 将牌未定：没有「门」的概念，不猜
  assert.deepEqual(
    followSuitCards(hand, null, { plays: [{ cards: [{ suit: 'S', rank: 3 }] }] }),
    [],
    '将牌未知时不该标牌'
  );
});

test('followSuitCards：领出主牌时标的是整手主牌（主花色 + 级牌 + 王同属一门）', () => {
  const trump = { strain: 'H', rank: 5 } as const;
  const hand: Card[] = [
    { suit: 'H', rank: 3 }, // 主花色
    { suit: 'S', rank: 5 }, // 副级：算主牌
    { suit: 'H', rank: 5 }, // 主级
    { joker: 'small' } as Card, // 王：恒主牌
    { suit: 'C', rank: 9 } // 真副牌，不该标
  ];
  const marked = followSuitCards(hand, trump, { plays: [{ cards: [{ joker: 'big' } as Card] }] });
  assert.equal(marked.length, 4, `领主牌时应标出 4 张主牌，实际 ${marked.length}`);
  assert.ok(
    marked.every((c) => !('suit' in c) || c.suit === 'H' || c.rank === 5),
    '被标的只能是主牌门里的牌'
  );
});

/* ---------- 本副结算弹窗：算式的符号、一行的结论、升级表 ---------- */

/** 只关心结论与升级表的结算摘要；其余字段填最小可用值 */
function summaryOf(overrides: Partial<DealSummary> = {}): DealSummary {
  return {
    dealNo: 1,
    contract: { points: 55, strain: 'S', declarerSeat: 0 },
    trump: { strain: 'S', rank: 2 },
    declarerTrickPoints: 60,
    defenderTrickPoints: 30,
    originalKitty: [],
    kitty: [],
    lastTrickSize: 1,
    protectedBottom: false,
    multiplier: 1,
    kittyPoints: 10,
    finalScore: 50,
    made: false,
    shortfall: 5,
    levelChanges: [],
    ...overrides
  };
}

/** 两名闲家各升 N 级（座位 1、2；庄家是 0） */
function defendersUp(levels: number): DealSummary['levelChanges'] {
  return ([1, 2] as const).map((seat) => ({
    seat,
    from: { rank: 2, cycle: 0 } as Level,
    to: { rank: 3, cycle: 0 } as Level,
    levels
  }));
}

test('kittySign：抠底是减号，保底是加号 —— 而且是 U+2212，不是 ASCII 连字符', () => {
  assert.equal(kittySign(true), '+');
  assert.equal(kittySign(false), '−');
  assert.equal(
    kittySign(false).codePointAt(0),
    0x2212,
    '抠底的减号必须是 U+2212：与 /rules 教程、编排台是同一个字形，同一条算式里不许混两种破折号'
  );
  assert.notEqual(kittySign(false), '-', '出现了 ASCII 连字符');
});

test('scoreLineText：打输写「差 N 分」、打成保留「打成」二字', () => {
  // 打输：截图里那一副 —— 墩分 60、底牌 10 × 1 被抠底 ⇒ 50 分对 55 的定约
  assert.equal(
    scoreLineText(summaryOf({ levelChanges: defendersUp(1) })),
    '50/55（差 5 分）· 闲家升 1 级'
  );
  // 打成：不再报「超出多少分」（恰好打平时「超 0 分」是句怪话），所以保留「打成」
  assert.equal(
    scoreLineText(
      summaryOf({
        made: true,
        shortfall: 0,
        finalScore: 65,
        contract: { points: 60, strain: 'S', declarerSeat: 0 },
        levelChanges: [{ seat: 0, from: { rank: 5, cycle: 0 }, to: { rank: 8, cycle: 0 }, levels: 2 }]
      })
    ),
    '打成 65/60 · 庄家升 2 级'
  );
  // 恰好打平（finalScore === 定约）也是常态，不许出现「差 0 分 / 超 0 分」
  assert.equal(
    scoreLineText(
      summaryOf({
        made: true,
        shortfall: 0,
        finalScore: 55,
        levelChanges: [{ seat: 0, from: { rank: 2, cycle: 0 }, to: { rank: 3, cycle: 0 }, levels: 1 }]
      })
    ),
    '打成 55/55 · 庄家升 1 级'
  );
});

test('scoreLineText：抠底扣成负分也照实写，且用同一个减号', () => {
  // 底牌分可以大到把庄家扣成负数（/rules 明写「扣成负数也可以」）：定约 40、最终 −5 ⇒ 差 45 ⇒ 各升 5 级
  const line = scoreLineText(
    summaryOf({
      finalScore: -5,
      shortfall: 45,
      contract: { points: 40, strain: 'C', declarerSeat: 0 },
      levelChanges: defendersUp(5)
    })
  );
  assert.equal(line, '−5/40（差 45 分）· 闲家升 5 级');
  assert.equal(line.includes('-'), false, `负分不许用 ASCII 连字符：${line}`);
});

test('scoreLineText：升级表缺失时不抛错（写成 0 级）', () => {
  assert.equal(scoreLineText(summaryOf()), '50/55（差 5 分）· 闲家升 0 级');
  assert.equal(
    scoreLineText(summaryOf({ made: true, shortfall: 0, finalScore: 60 })),
    '打成 60/55 · 庄家升 0 级'
  );
});

test('levelRows：三家都出现，升级的排前面，没升级的 from = to = 当前级别', () => {
  // 打输：两名闲家各升 1 级（座位 1、2），庄家（座位 0）不动
  const lost = levelRows(
    summaryOf({ levelChanges: defendersUp(1) }),
    [{ rank: 11, cycle: 1 }, { rank: 3, cycle: 0 }, { rank: 3, cycle: 0 }]
  );
  assert.equal(lost.length, 3, `三家都要出现，实际 ${lost.length} 行`);
  assert.deepEqual(
    lost.map((row) => row.seat),
    [1, 2, 0],
    '升级的两家排前面，没升级的庄家排在最后（组内仍按座位序）'
  );
  assert.deepEqual(
    lost.map((row) => row.changed),
    [true, true, false]
  );
  assert.deepEqual(lost[0], { seat: 1, from: { rank: 2, cycle: 0 }, to: { rank: 3, cycle: 0 }, changed: true });
  // 没升级那行：from 与 to 都是它当前的级别（这一个座位是 11(+1)，不是起始的 2）
  assert.deepEqual(lost[2], {
    seat: 0,
    from: { rank: 11, cycle: 1 },
    to: { rank: 11, cycle: 1 },
    changed: false
  });
});

test('levelRows：打成时庄家排第一，两名闲家都是「不变」', () => {
  const made = levelRows(
    summaryOf({
      made: true,
      finalScore: 65,
      levelChanges: [{ seat: 0, from: { rank: 5, cycle: 0 }, to: { rank: 8, cycle: 0 }, levels: 3 }]
    }),
    [{ rank: 8, cycle: 0 }, { rank: 2, cycle: 0 }, { rank: 2, cycle: 0 }]
  );
  assert.deepEqual(
    made.map((row) => [row.seat, row.changed]),
    [
      [0, true],
      [1, false],
      [2, false]
    ]
  );
  // 没升级的两家：from 与 to 相等，且没有被写成起始级别
  for (const row of made.slice(1)) assert.deepEqual(row.from, row.to);
});

test('levelRows：座位不重不漏 —— 升级表永远恰好三行', () => {
  const rows = levelRows(summaryOf({ levelChanges: defendersUp(2) }), []);
  assert.deepEqual(
    [...rows.map((row) => row.seat)].sort(),
    [0, 1, 2]
  );
  // levels 给空数组时（不该发生）回落到起始级别，而不是 undefined
  const fallback = rows.find((row) => row.seat === 0);
  assert.deepEqual(fallback?.from, { rank: 2, cycle: 0 });
});

