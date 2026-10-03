/**
 * 教程示例单测：教程里的每个牌面示例都用引擎自己的函数核对一遍。
 *
 * 这是「教程不会与规则漂移」的保证——引擎改了规则、或示例牌面被改错，
 * 这里就会红，而不是等玩家在 /rules 里学到错的东西。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cardClass,
  cardKey,
  cardLevel,
  cardsPoints,
  classSize,
  isHigherBid,
  isRun,
  leadInfo,
  levelFromProgress,
  levelLabel,
  levelProgress,
  madeLevels,
  segments,
  trickWinner,
  validateCall,
  validateFollow,
  validateLead,
  type Bid,
  type Card
} from '@sixty/engine';

import { checkPlay, levelParts, trumpText } from '../src/lib/labels.ts';
import { settlePreview } from '../src/lib/settle.ts';
import {
  BURY_HAND,
  cardsOf,
  DEFENDER_STEPS,
  DEMO_AUCTION,
  DEMO_CONTRACT,
  DEMO_KITTY,
  DEMO_SETTLE_INPUT,
  KITTY_EQUATION,
  LEVEL_DEMO,
  LEVEL_STEPS,
  MULTIPLIER_ROWS,
  OFF_RANK_EQUALS,
  POINT_CARDS,
  RUFF_LEAD,
  RUFF_WINNER,
  RUN_NOT_ADJACENT,
  RUN_SKIPS_LEVEL,
  TRUMP_DEMO_CARDS,
  TRUMP_HEARTS,
  TRUMP_LADDER,
  TRUMP_NT,
  TRUMP_RUN,
  TRY_DEMOS,
  UPGRADE_BANDS,
  handOf
} from '../src/lib/tutorial/scenarios.ts';

test('handOf 只接受真实存在的牌面键', () => {
  assert.equal(handOf('H5').length, 1);
  assert.equal(cardKey(handOf('j1')[0]!), 'j1');
  assert.equal(cardKey(handOf('c10')[0]!), 'C10');
  // J/Q/K/A 只是写作别名，内部仍是 cardKey 的数字层号
  assert.equal(cardKey(handOf('SK')[0]!), 'S13');
  assert.equal(cardKey(handOf('SA')[0]!), 'S14');
  assert.equal(cardKey(handOf('CJ')[0]!), 'C11');
  assert.equal(cardKey(handOf('CQ')[0]!), 'C12');
  assert.throws(() => handOf('H1'), /不存在/);
  assert.throws(() => handOf('Z5'), /不存在/);
  assert.throws(() => handOf('H15'), /不存在/);
  assert.throws(() => handOf('HX'), /不存在/);
});

test('示例牌面本身自洽：同一手牌不重复、领出的牌不在自己手里', () => {
  const hands: readonly [string, readonly Card[]][] = [
    ['POINT_CARDS', POINT_CARDS],
    ['BURY_HAND', BURY_HAND],
    ['DEMO_KITTY', DEMO_KITTY],
    ['TRUMP_DEMO_CARDS', TRUMP_DEMO_CARDS],
    ['TRUMP_LADDER', TRUMP_LADDER],
    ...TRY_DEMOS.map((demo) => [demo.id, demo.hand] as [string, readonly Card[]])
  ];
  for (const [name, cards] of hands) {
    const keys = cards.map(cardKey);
    assert.equal(new Set(keys).size, keys.length, `${name} 里有重复牌`);
  }
  for (const demo of TRY_DEMOS) {
    const own = new Set(demo.hand.map(cardKey));
    for (const card of demo.lead ?? []) {
      assert.equal(own.has(cardKey(card)), false, `${demo.id} 的领出牌出现在自己手里：${cardKey(card)}`);
    }
  }
});

test('分值示例与 100 分口径一致', () => {
  assert.equal(cardsPoints(DEMO_KITTY), KITTY_EQUATION.kittyPoints);
  assert.equal(KITTY_EQUATION.kittyPoints, 10);
  assert.equal(cardsPoints(handOf('H5')), 5);
  assert.equal(cardsPoints(handOf('D10')), 10);
  assert.equal(cardsPoints(handOf('SK')), 10);
  assert.equal(cardsPoints(handOf('j0', 'j1')), 0);
});

test('级牌与主牌：同一组牌在「主打 ♥」与「无主」下分类不同', () => {
  const has = (card: Card, trump: typeof TRUMP_HEARTS): boolean => cardClass(card, trump) === 'T';
  const [heartTwo, heartTen, heartFive, spadeFive, spadeTen, clubNine] = [
    handOf('H2')[0]!,
    handOf('H10')[0]!,
    handOf('H5')[0]!,
    handOf('S5')[0]!,
    handOf('S10')[0]!,
    handOf('C9')[0]!
  ];

  assert.equal(has(heartTwo, TRUMP_HEARTS), true, '主花色小牌是主牌');
  assert.equal(has(heartTwo, TRUMP_NT), false, '无主时主花色不存在');
  assert.equal(has(heartTen, TRUMP_HEARTS), true);
  assert.equal(has(heartTen, TRUMP_NT), false);
  assert.equal(has(heartFive, TRUMP_NT), true, '无主时级牌仍是主牌');
  assert.equal(has(spadeFive, TRUMP_NT), true, '无主时四张级牌都是主牌');
  assert.equal(has(spadeFive, TRUMP_HEARTS), true, '副级牌也是主牌');
  assert.equal(has(spadeTen, TRUMP_NT), false);
  assert.equal(has(clubNine, TRUMP_NT), false);

  const trumpCount = (trump: typeof TRUMP_HEARTS): number =>
    TRUMP_DEMO_CARDS.filter((card) => cardClass(card, trump) === 'T').length;
  assert.equal(trumpCount(TRUMP_HEARTS), 8, '♥ 主打：主花色 2 张 + 四张级牌 + 双王');
  assert.equal(trumpCount(TRUMP_NT), 6, '无主：只有四张级牌 + 双王');
  assert.equal(classSize(TRUMP_NT, 'T'), 6);
  assert.equal(classSize(TRUMP_HEARTS, 'T'), 18);
});

test('主牌全序：主花色小牌 < 副级 < 主级 < 小王 < 大王', () => {
  const levels = TRUMP_LADDER.map((card) => cardLevel(card, TRUMP_HEARTS));
  assert.deepEqual(levels, [1, 2, 13, 14, 15, 16]);
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i]! > levels[i - 1]!, '全序示例必须是严格递增的');
  }
});

test('顺子：副牌顺子跳过级牌，不相邻的牌不构成顺子', () => {
  assert.equal(isRun(RUN_SKIPS_LEVEL, TRUMP_HEARTS), true, '♣3-4-6 应连成顺子（5 是级牌，归主牌）');
  assert.equal(validateLead(RUN_SKIPS_LEVEL, RUN_SKIPS_LEVEL, TRUMP_HEARTS), null);
  assert.equal(isRun(TRUMP_RUN, TRUMP_HEARTS), true, '♥3-4-6 在主牌全序里也相邻');
  assert.equal(isRun(RUN_NOT_ADJACENT, TRUMP_HEARTS), false, '♣3 与 ♣9 不相邻');
  assert.notEqual(validateLead(RUN_NOT_ADJACENT, RUN_NOT_ADJACENT, TRUMP_HEARTS), null);
});

test('副级相等：三张副级大小完全相同，彼此不构成顺子相邻', () => {
  const levels = OFF_RANK_EQUALS.map((card) => cardLevel(card, TRUMP_HEARTS));
  assert.deepEqual(levels, [13, 13, 13]);
  assert.equal(isRun(OFF_RANK_EQUALS, TRUMP_HEARTS), false);
  assert.deepEqual(segments(OFF_RANK_EQUALS, TRUMP_HEARTS), [1, 1, 1]);
});

test('三个练手示例：正例一律合法、反例一律被拒，且走的是界面同一条 checkPlay', () => {
  for (const demo of TRY_DEMOS) {
    const lead = demo.lead === null ? null : leadInfo(demo.lead, demo.trump);
    if (demo.lead !== null) assert.notEqual(lead, null, `${demo.id} 的领出牌面本身不合法`);

    for (const keys of demo.legal) {
      const cards = cardsOf(keys);
      assert.equal(
        checkPlay({ hand: demo.hand, trump: demo.trump, lead: demo.lead }, cards),
        null,
        `${demo.id} 的正例 ${keys.join('+')} 被判非法`
      );
    }
    for (const keys of demo.illegal) {
      const cards = cardsOf(keys);
      assert.notEqual(
        checkPlay({ hand: demo.hand, trump: demo.trump, lead: demo.lead }, cards),
        null,
        `${demo.id} 的反例 ${keys.join('+')} 竟被判合法`
      );
    }
  }
});

test('结构优先：领 4 顺时 3 顺 + 1 合法，2 顺 + 2 与跨门都非法', () => {
  const demo = TRY_DEMOS.find((item) => item.id === 'follow')!;
  const info = leadInfo(demo.lead!, demo.trump)!;
  assert.equal(validateFollow(demo.hand, cardsOf(['C3', 'C4', 'C6', 'CQ']), info, demo.trump), null);
  assert.match(validateFollow(demo.hand, cardsOf(['CQ', 'CK', 'C3', 'C4']), info, demo.trump) ?? '', /结构/);
  assert.match(validateFollow(demo.hand, cardsOf(['C3', 'C4', 'C6', 'S9']), info, demo.trump) ?? '', /该门/);
});

test('杀牌与垫牌：主牌顺子赢下副牌领出，垫牌赢不了', () => {
  const ruff = trickWinner(
    [
      { seat: 0, cards: RUFF_LEAD },
      { seat: 1, cards: RUFF_WINNER }
    ],
    TRUMP_HEARTS
  );
  assert.equal(ruff, 1, '最低的三张主牌顺子也应杀掉 ♠A-K-Q');

  const discard = trickWinner(
    [
      { seat: 0, cards: RUFF_LEAD },
      { seat: 2, cards: cardsOf(['C2', 'C3', 'D4']) }
    ],
    TRUMP_HEARTS
  );
  assert.equal(discard, 0, '垫牌不能赢');

  const structural = trickWinner(
    [
      { seat: 0, cards: cardsOf(['C8', 'C9', 'C10', 'CJ']) },
      { seat: 1, cards: cardsOf(['C3', 'C4', 'C6', 'CQ']) }
    ],
    TRUMP_HEARTS
  );
  assert.equal(structural, 0, '结构性跟牌（3 顺 + 1）不能赢');
});

test('叫牌示例按引擎规则合法，且结论与展示的结论一致', () => {
  let highest: Bid | null = null;
  let passes = 0;
  let settled = false;
  for (const entry of DEMO_AUCTION) {
    assert.equal(settled, false, '连续两家不叫成交后不该再有叫品');
    assert.equal(validateCall(entry.call, highest), null, `叫品 ${JSON.stringify(entry.call)} 不合法`);
    if (entry.call === 'pass') {
      passes += 1;
      if (passes >= 2) settled = true;
      continue;
    }
    passes = 0;
    assert.equal(isHigherBid(entry.call, highest), true);
    highest = entry.call;
  }
  assert.equal(settled, true, '示例应当以连续两家不叫成交');
  assert.deepEqual(highest, { points: DEMO_CONTRACT.points, strain: DEMO_CONTRACT.strain });
});

test('结算示例：算式与升级表都对得上', () => {
  const { contract, trickPoints, kittyPoints, multiplier, madeFinal, setFinal } = KITTY_EQUATION;
  assert.equal(trickPoints + kittyPoints * multiplier, madeFinal, '保底算式');
  assert.equal(trickPoints - kittyPoints * multiplier, setFinal, '抠底算式');
  assert.ok(madeFinal >= contract);
  assert.ok(setFinal < contract);
  assert.equal(madeLevels(madeFinal), 3, '75 分打成应升 3 级');
  assert.equal(madeLevels(90), 5);
  assert.equal(Math.ceil((contract - setFinal) / 10), 4, '差 35 分时闲家各升 4 级');
});

test('叫牌一节的门槛示例：闲家门槛随保底/抠底移动，不是简单的 100 − 定约', () => {
  const preview = settlePreview(DEMO_SETTLE_INPUT);
  assert.equal(DEMO_SETTLE_INPUT.contract, DEMO_CONTRACT.points);
  assert.equal(DEMO_SETTLE_INPUT.kittyPoints, cardsPoints(DEMO_KITTY));
  assert.equal(preview.naiveBar, 55, '直觉值 100 − 45');
  assert.equal(preview.protectBar, 65);
  assert.equal(preview.digBar, 25);
  // 教程里渲染的就是这三个数，不能出现「闲家抓到 55 分就把他打输」这种漏掉底牌的说法
  assert.notEqual(preview.protectBar, preview.naiveBar);
  assert.notEqual(preview.digBar, preview.naiveBar);
});

test('底牌倍数示例与末轮张数一一对应', () => {
  assert.deepEqual(
    MULTIPLIER_ROWS.map((row) => row.multiplier),
    [1, 2, 3]
  );
});

test('级别示例：5(+0) / A(+1) / 5(+2) 的拆分与徽标一致', () => {
  assert.deepEqual(LEVEL_DEMO.map(levelParts), [
    { rank: '5', cycle: 0 },
    { rank: 'A', cycle: 1 },
    { rank: '5', cycle: 2 }
  ]);
});

test('升级表只列可达分数，且每一档都与引擎的 madeLevels 对齐', () => {
  // 得分来自 5/10/K，永远是 5 的倍数：40..190 是全部可能打成的取值
  for (let score = 40; score <= 190; score += 5) {
    const band = UPGRADE_BANDS.find(
      (item) => score >= item.min && (item.max === null || score <= item.max)
    );
    assert.ok(band !== undefined, `${score} 分没有落在任何档位里`);
    const expected = band.max === null ? 5 + Math.floor((score - 90) / 5) : band.levels;
    assert.equal(madeLevels(score), expected, `${score} 分应为「${band.label}」`);
  }
  // 边界：55 仍是 1 级、60 跳到 2 级（下界可达，所以不存在 56/59 这种中间态）
  assert.equal(madeLevels(55), 1);
  assert.equal(madeLevels(60), 2);
  assert.equal(madeLevels(85), 4);
  assert.equal(madeLevels(90), 5);
  // 档位必须恰好覆盖、且互不重叠
  for (const band of UPGRADE_BANDS) {
    if (band.max === null) continue;
    assert.equal(band.max % 5, 0, `档位上界 ${band.max} 不是 5 的倍数（不可达）`);
    assert.equal((band.max + 5) % 5, 0);
  }
  const covered = UPGRADE_BANDS.slice(1).map((band) => band.min);
  assert.deepEqual(covered, [60, 70, 80, 90], '档位下界必须是 5 的倍数且递增');
});

test('闲家升级表与 ceil(差 / 10) 对齐（差也只会是 5 的倍数）', () => {
  for (const step of DEFENDER_STEPS) {
    assert.equal(step.shortfall % 5, 0, `差 ${step.shortfall} 不可达`);
    assert.equal(Math.ceil(step.shortfall / 10), step.levels, `差 ${step.shortfall} 的档位不符`);
  }
  // 差 5 也要升 1 级（向上取整），这是容易被写错的一格
  assert.equal(DEFENDER_STEPS.find((step) => step.shortfall === 5)?.levels, 1);
});

test('升级步进示例用引擎的进度换算核对（含 A 之后进 2(+1)）', () => {
  for (const step of LEVEL_STEPS) {
    assert.deepEqual(
      levelFromProgress(levelProgress(step.from) + step.levels),
      step.to,
      `${levelLabel(step.from)} 升 ${step.levels} 级应到 ${levelLabel(step.to)}`
    );
  }
  // 教程正文举的例子：5(+0) 打成 75 分 → 升 3 级 → 8(+0)
  assert.deepEqual(levelFromProgress(levelProgress({ rank: 5, cycle: 0 }) + madeLevels(75)), {
    rank: 8,
    cycle: 0
  });
});

test('trumpText：每个示例都能一句话说清将牌环境', () => {
  assert.equal(trumpText(TRUMP_HEARTS), '级牌 5 · 主打 ♥');
  assert.equal(trumpText(TRUMP_NT), '级牌 5 · 无主');
  assert.equal(trumpText({ strain: 'C', rank: 14 }), '级牌 A · 主打 ♣');
  assert.equal(trumpText({ strain: 'NT', rank: 2 }), '级牌 2 · 无主');
});
