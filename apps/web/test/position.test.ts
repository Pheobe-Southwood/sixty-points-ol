/**
 * 「三家当前的牌」的不变量测试。
 *
 * 牌局章新加的这条横条（叫牌屏与出牌屏都显示三家的手牌）全靠 `position.ts` 现算，
 * 所以这一份就是它的闸：**牌只能从手里走到桌面**，不能凭空多、不能凭空少。
 *
 * 判定用的是独立算出来的口径（直接从生成物里的 `tricks` 累加），不是拿实现去验实现：
 * 任意时刻 三家手牌 + 已经打出去的牌 + 埋回去的 3 张 == 54，且每张牌只出现在一个地方。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { StoryDealData } from '../src/lib/story/story-data.ts';
import { dealtHands, handsAfterTrick, handsBeforeTrick, playHands, trumpInHand } from '../src/lib/tutorial/position.ts';
import { trumpCount } from '../src/lib/tutorial/scenarios.ts';
import { STORIES } from '../src/lib/tutorial/stories/index.ts';

const SEATS = [0, 1, 2] as const;

function flat(hands: readonly (readonly string[])[]): string[] {
  return hands.flatMap((hand) => [...hand]);
}

/** 第 `ordinal` 墩**之前**已经打出去的牌（从生成物现算，与被测函数无关） */
function playedBefore(story: StoryDealData, ordinal: number): string[] {
  return story.tricks
    .filter((trick) => trick.ordinal < ordinal)
    .flatMap((trick) => trick.plays.flatMap((play) => [...play.cards]));
}

/** 第 `ordinal` 墩这一墩打出的牌 */
function playedIn(story: StoryDealData, ordinal: number): string[] {
  const trick = story.tricks.find((item) => item.ordinal === ordinal);
  assert.ok(trick !== undefined, `${story.slug} 没有第 ${ordinal} 墩`);
  return trick.plays.flatMap((play) => [...play.cards]);
}

test('发牌：三家各 17 张、互不重复，加上 3 张暗底正好一副 54 张', () => {
  for (const story of STORIES) {
    const hands = dealtHands(story);
    hands.forEach((hand, seat) => assert.equal(hand.length, 17, `${story.slug} 第 ${seat} 家不是 17 张`));
    const all = [...flat(hands), ...story.deal.originalKitty];
    assert.equal(all.length, 54, `${story.slug} 发牌后不是 54 张`);
    assert.equal(new Set(all).size, 54, `${story.slug} 发牌后有重复的牌`);
    assert.deepEqual(
      hands.map((hand) => [...hand]),
      story.deal.hands.map((hand) => [...hand]),
      `${story.slug} 发牌手牌与生成物不一致`
    );
  }
});

test('打牌起点：庄家拿上底牌、埋回去的那 3 张离开桌面，三家仍是各 17 张', () => {
  for (const story of STORIES) {
    const declarer = story.deal.contract?.declarerSeat ?? null;
    assert.notEqual(declarer, null, `${story.slug} 缺定约`);
    const hands = playHands(story);
    hands.forEach((hand, seat) => assert.equal(hand.length, 17, `${story.slug} 第 ${seat} 家开打时不是 17 张`));

    // 另外两家原样不动
    for (const seat of SEATS) {
      if (seat === declarer) continue;
      assert.deepEqual([...hands[seat]].sort(), [...story.deal.hands[seat]!].sort(), `${story.slug} 闲家 ${seat} 的手牌被改了`);
    }

    // 庄家 = 原手牌 + 拿上来的底牌 − 埋回去的 3 张
    const merged = [...story.deal.hands[declarer!]!, ...story.deal.originalKitty];
    const buried = new Set(story.deal.kitty);
    for (const key of story.deal.kitty) {
      assert.ok(merged.includes(key), `${story.slug} 埋回去的 ${key} 既不在庄家手里、也不在底牌里`);
    }
    const expected = merged.filter((key) => !buried.has(key));
    assert.deepEqual([...hands[declarer!]].sort(), expected.sort(), `${story.slug} 庄家开打时的手牌算错了`);

    // 底牌那 3 张不在任何人手里
    for (const key of story.deal.kitty) {
      assert.equal(flat(hands).includes(key), false, `${story.slug} 埋回去的 ${key} 还在某人手里`);
    }
  }
});

test('每一墩：手牌只减不增，且 三家手牌 + 已出手的牌 + 底牌 == 54（不重不漏）', () => {
  for (const story of STORIES) {
    for (const trick of story.tricks) {
      const ordinal = trick.ordinal;
      const before = handsBeforeTrick(story, ordinal);
      const after = handsAfterTrick(story, ordinal);
      const now = playedIn(story, ordinal);

      for (const seat of SEATS) {
        const expected = [...before[seat]].filter((key) => !now.includes(key));
        assert.deepEqual(
          [...after[seat]].sort(),
          expected.sort(),
          `${story.slug} 第 ${ordinal + 1} 墩：第 ${seat} 家的余牌不是「开打前 − 这一墩出的牌」`
        );
        assert.ok(after[seat].length <= before[seat].length, `${story.slug} 第 ${ordinal + 1} 墩手牌变多了`);
      }

      const onTable = [...flat(after), ...playedBefore(story, ordinal), ...now, ...story.deal.kitty];
      assert.equal(onTable.length, 54, `${story.slug} 第 ${ordinal + 1} 墩之后牌总数不是 54`);
      assert.equal(new Set(onTable).size, 54, `${story.slug} 第 ${ordinal + 1} 墩之后有牌重复出现`);
    }
  }
});

test('第一墩开打前 == 打牌起点；最后一墩打完三家都空了', () => {
  for (const story of STORIES) {
    const first = handsBeforeTrick(story, 0);
    assert.deepEqual(
      first.map((hand) => [...hand]),
      playHands(story).map((hand) => [...hand]),
      `${story.slug} 第一墩开打前与打牌起点不一致`
    );

    const last = story.tricks[story.tricks.length - 1]!;
    const after = handsAfterTrick(story, last.ordinal);
    for (const seat of SEATS) {
      assert.deepEqual(after[seat], [], `${story.slug} 最后一墩打完，第 ${seat} 家还有牌`);
    }
  }
});

test('「主 N 张」与引擎口径一致：三家手里的主牌 + 底牌里的主牌 == 整副牌的主牌数', () => {
  for (const story of STORIES) {
    const trump = story.deal.trump;
    if (trump === null) continue;
    const hands = dealtHands(story);
    const inHands = hands.reduce((sum, hand) => sum + trumpInHand(hand, trump), 0);
    const inKitty = trumpInHand(story.deal.originalKitty, trump);
    assert.equal(
      inHands + inKitty,
      trumpCount(trump),
      `${story.slug} 主牌数对不上：手里 ${inHands} + 底牌 ${inKitty} ≠ ${trumpCount(trump)}`
    );
  }
});
