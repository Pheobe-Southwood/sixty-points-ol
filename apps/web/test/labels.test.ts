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

import { STRAINS, type BidEntry, type Card, type PersonalView } from '@sixty/engine';

import {
  BID_GLYPH,
  bidText,
  callText,
  highestCall,
  isRedStrain,
  kittyHandDelta,
  lastCall
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
    // 拿上来的底牌属于玩家私有，挂在 you 上（`deal` 是观战者也拿得到的公共投影）
    you: { seat: 0, hand: [], isDeclarer: false, originalKitty: null }
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
