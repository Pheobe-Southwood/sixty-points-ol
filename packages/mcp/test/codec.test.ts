/**
 * 牌码编解码：一副牌全量往返 + 认不出来的输入必须**当场拒绝**。
 *
 * 为什么拒绝比宽容重要：出参与入参同形（`you.hand` 的元素可以原样喂回 `play`），
 * 而一次参数错要白跑一整个模型回合 —— 猜错一张牌的代价比报错大得多。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { fullDeck } from '@sixty/engine';
import { decodeCard, decodeCards, encodeCall, encodeCards, encodeCard } from '../src/codec.ts';

test('全量往返：一副 54 张牌编码再解码必须一模一样', () => {
  const deck = fullDeck();
  assert.equal(deck.length, 54);
  for (const card of deck) {
    const code = encodeCard(card);
    assert.deepEqual(decodeCard(code), card, `${JSON.stringify(card)} 往返失败（码：${code}）`);
  }
});

test('具体形状：花色字母 + 引擎等级数字（2..14，不混用 A/K/Q/J）', () => {
  assert.equal(encodeCard({ suit: 'S', rank: 14 }), 'S14');
  assert.equal(encodeCard({ suit: 'C', rank: 5 }), 'C5');
  assert.equal(encodeCard({ suit: 'H', rank: 10 }), 'H10');
  assert.equal(encodeCard({ suit: 'D', rank: 11 }), 'D11');
  assert.equal(encodeCard({ joker: 'small' }), 'j0');
  assert.equal(encodeCard({ joker: 'big' }), 'j1');

  assert.deepEqual(decodeCard('S14'), { suit: 'S', rank: 14 });
  assert.deepEqual(decodeCard('j0'), { joker: 'small' });
  assert.deepEqual(decodeCard('j1'), { joker: 'big' });
});

test('入参宽容只在没有歧义的地方：大小写、A/K/Q/J/T 当等级写', () => {
  assert.deepEqual(decodeCard('s14'), { suit: 'S', rank: 14 });
  assert.deepEqual(decodeCard(' ST '), { suit: 'S', rank: 10 });
  assert.deepEqual(decodeCard('h10'), { suit: 'H', rank: 10 });
  assert.deepEqual(decodeCard('DA'), { suit: 'D', rank: 14 });
  assert.deepEqual(decodeCard('SJ'), { suit: 'S', rank: 11 });
  assert.deepEqual(decodeCard('J0'), { joker: 'small' });
});

test('认不出来的一律 null，绝不猜一张牌出来', () => {
  for (const bad of ['', ' ', 'X5', 'S1', 'S15', 'S0', 'j2', 'j', 'S', '10S', 'SS', 'SJ0', '大王', 'C-1']) {
    assert.equal(decodeCard(bad), null, `「${bad}」不该被认成一张牌`);
  }
});

test('decodeCards 是全有或全无：一张坏码整组作废', () => {
  assert.deepEqual(decodeCards(['C5', 'S14']), [
    { suit: 'C', rank: 5 },
    { suit: 'S', rank: 14 }
  ]);
  assert.equal(decodeCards(['C5', 'X5']), null);
  assert.deepEqual(decodeCards([]), []);
});

test('叫品编码：pass / 分数 + 花色', () => {
  assert.equal(encodeCall('pass'), 'pass');
  assert.equal(encodeCall({ points: 40, strain: 'C' }), '40C');
  assert.equal(encodeCall({ points: 45, strain: 'NT' }), '45NT');
});

test('牌码确实比对象省：51 张打出牌的序列至少省掉三分之二', () => {
  const played = fullDeck().slice(0, 51);
  const asObjects = JSON.stringify(played).length;
  const asCodes = JSON.stringify(encodeCards(played)).length;
  assert.ok(asCodes * 3 < asObjects, `紧凑编码没省下多少：${asCodes} vs ${asObjects}`);
});
