import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { leadInfo, validateFollow, validateLead } from '../src/validate.ts';
import { BJ, SJ, c } from './helpers.ts';

const T = { strain: 'H' as const, rank: 7 };

function followErr(hand: ReturnType<typeof c>[], lead: ReturnType<typeof c>[], cards: ReturnType<typeof c>[]): string | null {
  const info = leadInfo(lead, T);
  assert.ok(info !== null);
  return validateFollow(hand, cards, info, T);
}

describe('领出', () => {
  it('单张任意门都可以领出', () => {
    assert.equal(validateLead([c('C', 2), BJ], [BJ], T), null);
  });

  it('多张必须同门（不允许甩牌）', () => {
    const err = validateLead([c('C', 2), c('D', 3)], [c('C', 2), c('D', 3)], T);
    assert.match(err ?? '', /同门/);
  });

  it('多张必须构成顺子', () => {
    assert.match(validateLead([c('C', 2), c('C', 4)], [c('C', 2), c('C', 4)], T) ?? '', /顺子/);
    assert.equal(validateLead([c('C', 2), c('C', 3)], [c('C', 2), c('C', 3)], T), null);
  });

  it('领出跨越级牌的顺子合法', () => {
    assert.equal(validateLead([c('C', 6), c('C', 8)], [c('C', 6), c('C', 8)], T), null);
  });

  it('不能出手里没有的牌', () => {
    assert.match(validateLead([c('C', 2)], [c('C', 3)], T) ?? '', /没有这些牌/);
  });
});

describe('跟牌：结构优先', () => {
  const lead = [c('C', 2), c('C', 3), c('C', 4)]; // 3 顺（层号 1,2,3）

  it('有该门够张数时必须跟该门，且出最长结构', () => {
    const hand = [c('C', 5), c('C', 6), c('C', 8), c('C', 10), c('C', 11), c('D', 2)];
    assert.equal(followErr(hand, lead, [c('C', 5), c('C', 6), c('C', 8)]), null);
    assert.match(followErr(hand, lead, [c('C', 10), c('C', 11), c('C', 5)]) ?? '', /结构不足/);
    assert.match(followErr(hand, lead, [c('C', 5), c('D', 2), c('C', 6)]) ?? '', /必须全部跟该门/);
  });

  it('该门张数不足时必须先出完该门', () => {
    const hand = [c('C', 5), c('C', 9), c('D', 2), c('D', 3)];
    assert.equal(followErr(hand, lead, [c('C', 5), c('C', 9), c('D', 2)]), null);
    assert.match(followErr(hand, lead, [c('C', 5), c('D', 2), c('D', 3)]) ?? '', /先出完该门/);
  });

  it('缺门时垫牌自由，也可用连续主牌杀牌', () => {
    const hand = [c('D', 2), c('D', 3), c('D', 4), c('H', 2), c('H', 3), c('H', 4)];
    assert.equal(followErr(hand, lead, [c('D', 2), c('D', 3), c('D', 4)]), null);
    assert.equal(followErr(hand, lead, [c('H', 2), c('H', 3), c('H', 4)]), null);
    assert.equal(followErr(hand, lead, [c('H', 2), c('H', 4), c('D', 2)]), null);
  });

  it('张数不符直接拒绝', () => {
    const hand = [c('C', 5), c('C', 6), c('C', 8)];
    assert.match(followErr(hand, lead, [c('C', 5), c('C', 6)]) ?? '', /必须出 3 张/);
  });
});

describe('跟牌：主牌领出', () => {
  const lead = [c('H', 2), c('H', 3)]; // 主牌 2 顺

  it('有主牌时必须跟主牌，且按结构优先', () => {
    const hand = [c('H', 4), c('H', 5), c('H', 9), c('H', 10), c('D', 2)];
    assert.equal(followErr(hand, lead, [c('H', 4), c('H', 5)]), null);
    assert.equal(followErr(hand, lead, [c('H', 9), c('H', 10)]), null);
    assert.match(followErr(hand, lead, [c('H', 4), c('H', 9)]) ?? '', /结构不足/);
  });

  it('主牌不足时出完主牌再垫牌', () => {
    const hand = [c('H', 4), c('D', 2), c('D', 3)];
    assert.equal(followErr(hand, lead, [c('H', 4), c('D', 2)]), null);
    assert.match(followErr(hand, lead, [c('D', 2), c('D', 3)]) ?? '', /先出完该门/);
  });

  it('副级牌算主牌，但不与其他副级相连', () => {
    const hand = [c('C', 7), c('D', 7), c('S', 7)];
    // 跟主牌 2 张：三张副级层号相等，只能是 1+1 结构
    assert.equal(followErr(hand, lead, [c('C', 7), c('D', 7)]), null);
  });

  it('大小王属主牌且在最高层相邻', () => {
    const hand = [c('H', 7), SJ, BJ];
    assert.equal(followErr(hand, lead, [SJ, BJ]), null);
    assert.equal(followErr(hand, lead, [c('H', 7), SJ]), null);
  });
});
