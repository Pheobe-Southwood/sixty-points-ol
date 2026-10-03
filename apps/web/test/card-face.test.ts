/**
 * 牌面映射单测：角落与正中必须指向同一张牌。
 *
 * 回归点是原始缺陷——王牌的角落写「大/小」、正中却只写一个「王」字，
 * 于是同一张牌在牌面上读出两种意思。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { cardFace } from '../src/lib/card-face.ts';
import { handOf } from '../src/lib/tutorial/scenarios.ts';

test('大王：角落「大 + 王」，正中「大王」，红字', () => {
  const face = cardFace(handOf('j1')[0]!);
  assert.equal(face.joker, true);
  assert.equal(face.rank, '大');
  assert.equal(face.glyph, '王');
  assert.equal(face.pip, '大王');
  assert.equal(face.red, true);
  assert.equal(face.aria, '大王');
});

test('小王：角落「小 + 王」，正中「小王」，黑字', () => {
  const face = cardFace(handOf('j0')[0]!);
  assert.equal(face.joker, true);
  assert.equal(face.rank, '小');
  assert.equal(face.glyph, '王');
  assert.equal(face.pip, '小王');
  assert.equal(face.red, false);
  assert.equal(face.aria, '小王');
});

test('回归：正中不再单独出现一个「王」字（角落与正中会读成两张牌）', () => {
  for (const key of ['j0', 'j1']) {
    const face = cardFace(handOf(key)[0]!);
    assert.notEqual(face.pip, '王', `${key} 的正中仍是孤零零的「王」`);
    assert.ok(face.pip.startsWith(face.rank), `${key} 的正中应包含角落的「${face.rank}」`);
    assert.equal(face.pip, `${face.rank}王`);
  }
  // 角落两排拼起来必须正好等于正中
  for (const key of ['j0', 'j1']) {
    const face = cardFace(handOf(key)[0]!);
    assert.equal(face.rank + face.glyph, face.pip);
  }
});

test('普通牌：角落与正中沿用花色字形，点数用 A/J/Q/K', () => {
  const spade = cardFace(handOf('SA')[0]!);
  assert.deepEqual(spade, { rank: 'A', glyph: '♠', pip: '♠', red: false, aria: '♠A', joker: false });

  const heartTen = cardFace(handOf('H10')[0]!);
  assert.equal(heartTen.rank, '10');
  assert.equal(heartTen.red, true);
  assert.equal(heartTen.aria, '♥10');

  assert.equal(cardFace(handOf('DJ')[0]!).rank, 'J');
  assert.equal(cardFace(handOf('CQ')[0]!).rank, 'Q');
  assert.equal(cardFace(handOf('HK')[0]!).rank, 'K');
  assert.equal(cardFace(handOf('D4')[0]!).rank, '4');
});

test('红色只由花色/王决定：♦♥ 与大王红，♠♣ 与小王不红', () => {
  const redOf = (key: string): boolean => cardFace(handOf(key)[0]!).red;
  assert.deepEqual(
    ['SA', 'SK', 'HA', 'HK', 'DA', 'DK', 'CA', 'CK', 'j0', 'j1'].map(redOf),
    [false, false, true, true, true, true, false, false, false, true]
  );
});
