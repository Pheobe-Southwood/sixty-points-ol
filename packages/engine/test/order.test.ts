import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bestProfile, cardClass, cardLevel, compareProfiles, isRun, segments, sortHand, suitDisplayOrder } from '../src/order.ts';
import { validateFollow } from '../src/validate.ts';
import { fullDeck, type Suit } from '../src/cards.ts';
import { BJ, SJ, c, combinations, mulberry32, sample } from './helpers.ts';

const T = { strain: 'H' as const, rank: 7 };

describe('主牌模型', () => {
  it('有主时的门归属：主花色、副级、主级、双王均为主牌', () => {
    assert.equal(cardClass(c('H', 8), T), 'T');
    assert.equal(cardClass(c('C', 2), T), 'C');
    assert.equal(cardClass(c('H', 7), T), 'T');
    assert.equal(cardClass(c('C', 7), T), 'T');
    assert.equal(cardClass(c('D', 7), T), 'T');
    assert.equal(cardClass(c('S', 7), T), 'T');
    assert.equal(cardClass(SJ, T), 'T');
    assert.equal(cardClass(BJ, T), 'T');
  });

  it('主花色级牌抽出、副级相等、王最大', () => {
    assert.equal(cardLevel(c('H', 2), T), 1);
    assert.equal(cardLevel(c('H', 6), T), 5);
    assert.equal(cardLevel(c('H', 8), T), 6);
    assert.equal(cardLevel(c('H', 14), T), 12);
    assert.equal(cardLevel(c('C', 7), T), 13);
    assert.equal(cardLevel(c('D', 7), T), 13);
    assert.equal(cardLevel(c('S', 7), T), 13);
    assert.equal(cardLevel(c('H', 7), T), 14);
    assert.equal(cardLevel(SJ, T), 15);
    assert.equal(cardLevel(BJ, T), 16);
  });

  it('副牌跳过级牌后仍然相邻', () => {
    assert.equal(cardLevel(c('C', 6), T), 5);
    assert.equal(cardLevel(c('C', 8), T), 6);
    assert.equal(isRun([c('C', 6), c('C', 8)], T), true);
    assert.equal(isRun([c('C', 8), c('C', 9), c('C', 10)], T), true);
    assert.equal(isRun([c('C', 8), c('C', 10)], T), false);
  });

  it('主牌顺子可含一张副级：A♠ + ♣7 + 主7 + 小王（主为黑桃、级牌 7）', () => {
    const t = { strain: 'S' as const, rank: 7 };
    assert.equal(isRun([c('S', 14), c('C', 7), c('S', 7), SJ], t), true);
    assert.deepEqual(segments([c('S', 14), c('C', 7), c('S', 7), SJ], t), [4]);
  });

  it('两张副级不构成顺子（层号相等则断开）', () => {
    assert.equal(isRun([c('C', 7), c('D', 7)], T), false);
    assert.deepEqual(segments([c('C', 7), c('D', 7)], T), [1, 1]);
  });

  it('无主时四张级牌相等，序为 级牌 < 小王 < 大王', () => {
    const nt = { strain: 'NT' as const, rank: 5 };
    assert.equal(cardLevel(c('C', 5), nt), 1);
    assert.equal(cardLevel(c('S', 5), nt), 1);
    assert.equal(cardLevel(SJ, nt), 2);
    assert.equal(cardLevel(BJ, nt), 3);
    assert.equal(isRun([c('C', 5), c('D', 5)], nt), false);
    assert.equal(isRun([c('C', 5), SJ], nt), true);
    assert.equal(isRun([c('C', 5), SJ, BJ], nt), true);
  });
});

describe('结构优先（最长连续段优先）', () => {
  it('领 4 顺、持 3+2 → 3 顺 + 任 1 张', () => {
    const holding = [c('C', 2), c('C', 3), c('C', 4), c('C', 9), c('C', 10)];
    assert.deepEqual(bestProfile(holding, T, 4), [3, 1]);
  });

  it('领 4 顺、持 2+2 → 两顺跟完', () => {
    const holding = [c('C', 2), c('C', 3), c('C', 8), c('C', 9)];
    assert.deepEqual(bestProfile(holding, T, 4), [2, 2]);
  });

  it('领 5 顺、持 3+3+2 → 一个 3 顺 + 一个 2 顺段', () => {
    const holding = [
      c('C', 2), c('C', 3), c('C', 4),
      c('C', 9), c('C', 10), c('C', 11),
      c('C', 13), c('C', 14)
    ];
    assert.deepEqual(bestProfile(holding, T, 5), [3, 2]);
  });

  it('领 6 顺、持单个 7 连（跨过级牌）→ 整段取 6 张', () => {
    const holding = [c('C', 2), c('C', 3), c('C', 4), c('C', 5), c('C', 6), c('C', 8), c('C', 9)];
    assert.deepEqual(segments(holding, T), [7]);
    assert.deepEqual(bestProfile(holding, T, 6), [6]);
  });

  it('跳过级牌后 2..12 连成一段 10 连', () => {
    const holding = [
      c('C', 2), c('C', 3), c('C', 4), c('C', 5), c('C', 6), c('C', 8), c('C', 9),
      c('C', 10), c('C', 11), c('C', 12)
    ];
    assert.deepEqual(segments(holding, T), [10]);
    assert.deepEqual(bestProfile(holding, T, 7), [7]);
  });

  it('持 7+2、领 7 顺 → 直接整段 7 张', () => {
    const holding = [
      c('C', 2), c('C', 3), c('C', 4), c('C', 5), c('C', 6), c('C', 8), c('C', 9),
      c('C', 11), c('C', 12)
    ];
    assert.deepEqual(segments(holding, T), [7, 2]);
    assert.deepEqual(bestProfile(holding, T, 7), [7]);
  });

  it('预算不足时从最长段取等长连续片', () => {
    const holding = [c('C', 2), c('C', 3), c('C', 4), c('C', 5), c('C', 6), c('C', 8), c('C', 9)];
    assert.deepEqual(segments(holding, T), [7]);
    assert.deepEqual(bestProfile(holding, T, 5), [5]);
  });

  it('跨门调用结构分解会显式报错（不静默算错）', () => {
    assert.throws(() => bestProfile([c('C', 2), c('D', 2)], T, 1), /同一门/);
  });
});

describe('重复层号的分解（副级 / 无主级牌）', () => {
  const T13 = { strain: 'C' as const, rank: 13 }; // 梅花为将、级牌 K

  it('回归：持 A + 两张副级 + 主级 时，3 张即可取出三连', () => {
    const holding = [c('C', 14), c('D', 13), c('C', 13), c('S', 13)];
    assert.deepEqual(segments(holding, T13), [3, 1]);
    assert.deepEqual(bestProfile(holding, T13, 3), [3]);
  });

  it('回归：上例中 ♣A + ♠K(副级) + ♣K(主级) 跟主牌三连合法', () => {
    const holding = [c('C', 14), c('D', 13), c('C', 13), c('S', 13)];
    const lead = { cardClass: 'T' as const, cards: [c('C', 3), c('C', 4), c('C', 5)], size: 3 };
    assert.equal(validateFollow(holding, [c('C', 14), c('S', 13), c('C', 13)], lead, T13), null);
    assert.match(
      validateFollow(holding, [c('C', 14), c('D', 13), c('S', 13)], lead, T13) ?? '',
      /结构不足/
    );
  });

  it('层号相等的牌不能同链：两张副级是 1+1', () => {
    assert.deepEqual(segments([c('D', 13), c('S', 13)], T13), [1, 1]);
  });

  it('无主：级牌四张相等、王在最高处相邻', () => {
    const nt = { strain: 'NT' as const, rank: 5 };
    const holding = [c('C', 5), c('D', 5), c('H', 5), SJ, BJ];
    assert.deepEqual(segments(holding, nt), [3, 1, 1]);
  });
});

describe('bestProfile 与暴力枚举一致', () => {
  it('随机同门牌组：分解不劣于任何 n 张子集，且其结果可由某子集实现', () => {
    const rng = mulberry32(4242);
    const models = [
      { strain: 'C' as const, rank: 13 },
      { strain: 'H' as const, rank: 7 },
      { strain: 'NT' as const, rank: 5 },
      { strain: 'S' as const, rank: 14 }
    ];
    for (let trial = 0; trial < 240; trial++) {
      const t = models[trial % models.length]!;
      const pool = fullDeck().filter((card) => cardClass(card, t) === 'T');
      const size = 2 + Math.floor(rng() * Math.min(7, pool.length - 1));
      const holding = sample(pool, size, rng);
      for (let n = 1; n <= holding.length; n++) {
        const best = bestProfile(holding, t, n);
        let achievable = false;
        for (const subset of combinations(holding, n)) {
          const prof = segments(subset, t);
          assert.ok(
            compareProfiles(prof, best) <= 0,
            `子集分解 ${JSON.stringify(prof)} 不应优于 best ${JSON.stringify(best)}`
          );
          if (compareProfiles(prof, best) === 0) achievable = true;
        }
        assert.ok(achievable, `best ${JSON.stringify(best)} 必须能由某个 ${n} 张子集实现`);
      }
    }
  });
});

describe('手牌排序', () => {  it('主牌在前，其余副牌黑红交替，同门由大到小', () => {
    const cards = [c('D', 5), c('C', 9), BJ, c('S', 3), c('H', 7), c('H', 9)];
    const sorted = sortHand(cards, T);
    assert.deepEqual(
      sorted.map((x) => ('joker' in x ? x.joker : `${x.suit}${x.rank}`)),
      ['big', 'H7', 'H9', 'S3', 'D5', 'C9']
    );
  });

  it('副牌显示序：去掉主牌花色后同色两门放两端，相邻两门必异色', () => {
    const red = (suit: Suit): boolean => suit === 'H' || suit === 'D';
    for (const strain of ['S', 'H', 'C', 'D'] as const) {
      const order = suitDisplayOrder({ strain, rank: 7 });
      assert.deepEqual(
        [...order].sort(),
        ['S', 'H', 'C', 'D'].filter((suit) => suit !== strain).sort(),
        `主打 ${strain} 时副牌序应恰为其余三门`
      );
      for (let i = 1; i < order.length; i++) {
        assert.notEqual(
          red(order[i]!),
          red(order[i - 1]!),
          `主打 ${strain} 时 ${order[i - 1]} 与 ${order[i]} 同色相邻（应为黑红交替）：${order.join('')}`
        );
      }
    }
  });

  it('无主与将牌未定：四门仍是 ♠♥♣♦（它本身就黑红交替）', () => {
    assert.deepEqual(suitDisplayOrder(null), ['S', 'H', 'C', 'D']);
    assert.deepEqual(suitDisplayOrder({ strain: 'NT', rank: 7 }), ['S', 'H', 'C', 'D']);
  });
});
