/**
 * 牌面映射单测：牌名只能出现在**角落索引**里，正面正中是图案/花色，不再写名字。
 *
 * 走过两次弯路，两个回归点都留在这里：
 *   ① 角落写「大/小」、正中只写一个「王」—— 同一张牌读出两种意思；
 *   ② 角落与正中都写名字 —— 一张牌上「小王」重复三遍（更抽象）。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { JOKER_PIP, cardFace } from '../src/lib/card-face.ts';
import { handOf } from '../src/lib/tutorial/scenarios.ts';

test('大王：角落「大 + 王」，正中红日，红字', () => {
  const face = cardFace(handOf('j1')[0]!);
  assert.equal(face.joker, true);
  assert.equal(face.rank, '大');
  assert.equal(face.glyph, '王');
  assert.equal(face.pip, '☀');
  assert.equal(face.red, true);
  assert.equal(face.aria, '大王');
});

test('小王：角落「小 + 王」，正中素月，黑字', () => {
  const face = cardFace(handOf('j0')[0]!);
  assert.equal(face.joker, true);
  assert.equal(face.rank, '小');
  assert.equal(face.glyph, '王');
  assert.equal(face.pip, '☾');
  assert.equal(face.red, false);
  assert.equal(face.aria, '小王');
});

test('不变量：角落两排拼起来正好是牌名', () => {
  for (const key of ['j0', 'j1']) {
    const face = cardFace(handOf(key)[0]!);
    assert.equal(face.rank + face.glyph, face.aria, `${key} 的角落索引拼不出牌名`);
  }
  assert.equal(cardFace(handOf('j1')[0]!).rank + cardFace(handOf('j1')[0]!).glyph, '大王');
  assert.equal(cardFace(handOf('j0')[0]!).rank + cardFace(handOf('j0')[0]!).glyph, '小王');
});

test('回归 ①：正中不再只写一个「王」（角落写大、正中写王，会读成两张牌）', () => {
  for (const key of ['j0', 'j1']) {
    assert.notEqual(cardFace(handOf(key)[0]!).pip, '王');
  }
});

test('回归 ②：正中不再是文字名（否则「小王」在一张牌上重复三遍）', () => {
  for (const key of ['j0', 'j1']) {
    const face = cardFace(handOf(key)[0]!);
    for (const ch of ['大', '小', '王']) {
      assert.equal(face.pip.includes(ch), false, `${key} 的正中仍含「${ch}」：${face.pip}`);
    }
    assert.equal(face.pip, JOKER_PIP[key === 'j1' ? 'big' : 'small']);
  }
  // 两张王的图案必须不同，否则分不出大小
  assert.notEqual(cardFace(handOf('j0')[0]!).pip, cardFace(handOf('j1')[0]!).pip);
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
