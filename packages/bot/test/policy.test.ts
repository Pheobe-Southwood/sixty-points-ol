/**
 * 策略单测：固定局面 → 期望动作（确定性策略让断言可以钉死到具体牌）。
 * 视图构造直接手写引擎 GameState 再过 `personalView`，与真实服务器的投影同一条路。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cardKey,
  cardPoints,
  checkPlay,
  containsCard,
  createGame,
  fullDeck,
  KITTY_SIZE,
  personalView,
  removeCards,
  type BidEntry,
  type Card,
  type CompletedTrick,
  type Contract,
  type Level,
  type PersonalView,
  type Rank,
  type Seat,
  type Suit,
  type Trick,
  type TrumpModel
} from '@sixty/engine';
import { bidFor, buryFor, playFor, strengthOf, willingPoints } from '../src/policy.ts';

const SJ: Card = { joker: 'small' };
const BJ: Card = { joker: 'big' };
const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });
const keys = (cards: readonly Card[]): string[] => cards.map(cardKey).sort();
const spades = (cards: readonly Card[]): string[] =>
  cards.map(cardKey).filter((key) => key.startsWith('S'));
const levelsOf = (ranks: [Rank, Rank, Rank]): Level[] => ranks.map((rank) => ({ rank, cycle: 0 }));

function fillers(used: readonly Card[], count: number): Card[] {
  const pool = fullDeck().filter((card) => !containsCard(used, card));
  return pool.slice(0, count);
}

function makeAuction(
  hand: readonly Card[],
  auction: readonly BidEntry[] = [],
  ranks: [Rank, Rank, Rank] = [2, 2, 2],
  seat: Seat = 0
): PersonalView {
  const rest = fillers(hand, 34);
  const game = createGame(0);
  game.levels = levelsOf(ranks);
  game.dealNo = 1;
  game.deal = {
    phase: 'auction',
    dealNo: 1,
    dealerSeat: 0,
    hands: [[...hand], rest.slice(0, 17), rest.slice(17, 34)],
    originalKitty: rest.slice(34, 37),
    kitty: rest.slice(34, 37),
    auction: [...auction],
    contract: null,
    trump: null,
    trick: null,
    trickHistory: [],
    captured: [[], [], []],
    summary: null
  };
  return personalView(game, seat);
}

interface PlayRig {
  readonly hand: readonly Card[];
  readonly trump: TrumpModel;
  readonly seat?: Seat;
  readonly declarer?: Seat;
  readonly trick?: Trick | null;
  readonly history?: readonly CompletedTrick[];
  readonly points?: number;
}

function makePlay(rig: PlayRig): PersonalView {
  const seat = rig.seat ?? 0;
  const declarer = rig.declarer ?? 0;
  const others = fillers(rig.hand, 34);
  const contract: Contract = { points: rig.points ?? 40, strain: rig.trump.strain, declarerSeat: declarer };
  const hands: Card[][] = [others.slice(0, 17), others.slice(17, 34), []];
  hands[seat] = [...rig.hand];
  const game = createGame(0);
  game.levels = levelsOf([2, 2, 2]);
  game.dealNo = 1;
  game.deal = {
    phase: 'play',
    dealNo: 1,
    dealerSeat: 0,
    hands,
    originalKitty: others.slice(34, 37),
    kitty: others.slice(34, 37),
    auction: [],
    contract,
    trump: rig.trump,
    trick: rig.trick ?? { leaderSeat: declarer, plays: [] },
    trickHistory: rig.history ? [...rig.history] : [],
    captured: [[], [], []],
    summary: null
  };
  return personalView(game, seat);
}

/** 进过墩史的牌对记牌（Sight）可见 */
function played(seat: Seat, cards: readonly Card[]): CompletedTrick {
  return { leaderSeat: 0, plays: [{ seat, cards }], winnerSeat: seat, points: 0 };
}

// ---------------------------------------------------------------------------
// 叫牌
// ---------------------------------------------------------------------------

test('强牌开叫 40 于最佳花色（长主色 + 大王 + 副牌 A）', () => {
  const hand = [
    c('S', 14), c('S', 13), c('S', 12), c('S', 10), c('S', 9), c('S', 8), c('S', 5),
    BJ, SJ,
    c('H', 14), c('H', 7),
    c('D', 6), c('D', 4),
    c('C', 3), c('C', 5), c('C', 8), c('C', 11)
  ];
  const view = makeAuction(hand);
  assert.deepEqual(bidFor(view, view.you), { points: 40, strain: 'S' });
});

test('弱牌开叫阶段 pass', () => {
  const hand = [
    c('S', 5), c('S', 7), c('H', 4), c('H', 8), c('H', 10), c('D', 3), c('D', 6),
    c('D', 9), c('D', 11), c('C', 4), c('C', 6), c('C', 8), c('C', 10),
    c('C', 12), c('H', 9), c('S', 3), c('D', 12)
  ];
  const view = makeAuction(hand);
  assert.equal(bidFor(view, view.you), 'pass');
});

test('竞叫只走最小合法步长：同分换更高花色 / 同花色 +5', () => {
  const strong = [
    c('H', 14), c('H', 13), c('H', 12), c('H', 10), c('H', 9), c('H', 8), c('H', 3),
    BJ,
    c('S', 14), c('S', 6), c('D', 5), c('D', 4), c('D', 3), c('C', 2), c('C', 8), c('C', 11), c('C', 12)
  ];
  // 最高叫品 40♠：♥ 花色序低于 ♠ → 只能 +5 → 45♥
  const over = makeAuction(strong, [{ seat: 1, call: { points: 40, strain: 'S' } }]);
  assert.deepEqual(bidFor(over, over.you), { points: 45, strain: 'H' });
  // 最高叫品 40♦：♥ 比 ♦ 高 → 同分 40♥
  const same = makeAuction(strong, [{ seat: 1, call: { points: 40, strain: 'D' } }]);
  assert.deepEqual(bidFor(same, same.you), { points: 40, strain: 'H' });
});

test('超出愿意分数就 pass（不跳叫追高）', () => {
  const hand = [
    c('D', 14), c('D', 13), c('D', 12), c('D', 8), c('D', 4),
    c('H', 14), c('S', 13), c('C', 5), c('C', 8), c('C', 11),
    c('H', 3), c('H', 6), c('S', 4), c('S', 7), c('S', 10), c('D', 9), c('H', 11)
  ];
  const view = makeAuction(hand, [{ seat: 2, call: { points: 70, strain: 'H' } }]);
  assert.equal(bidFor(view, view.you), 'pass');
});

test('最高叫品已是自己的 → pass（不抬自己）', () => {
  const hand = [
    c('S', 14), c('S', 13), c('S', 12), c('S', 10), c('S', 9), c('S', 8), c('S', 5),
    BJ, SJ,
    c('H', 14), c('H', 7), c('D', 6), c('D', 4), c('C', 3), c('C', 5), c('C', 8), c('C', 11)
  ];
  const view = makeAuction(hand, [
    { seat: 0, call: { points: 40, strain: 'S' } },
    { seat: 1, call: 'pass' }
  ]);
  assert.equal(bidFor(view, view.you), 'pass');
});

test('willingPoints 是阶梯映射且封顶 85', () => {
  assert.equal(willingPoints(14), 0);
  assert.equal(willingPoints(15), 40);
  assert.equal(willingPoints(18), 45);
  assert.equal(willingPoints(30), 65);
  assert.equal(willingPoints(100), 85);
});

test('strengthOf：级牌归主牌门，副牌 A 计分，缺门加分', () => {
  const hand = [c('S', 14), c('S', 13), c('H', 2), c('C', 2), c('D', 2), c('H', 5)];
  const s = strengthOf(hand, 2, 'S');
  // 主牌 = ♠A ♠K + 三张副级 2：A(+2) K(+2) 副级×3(+6) = 10；♣♦ 缺门各 +1；♥5 无大牌。
  // 主花色 ♠ 整门都是主牌，**不再**算一次副门（否则会白拿第三个缺门加分）。
  assert.equal(s.trumps, 5);
  assert.equal(s.value, 12);
});

// ---------------------------------------------------------------------------
// 埋底
// ---------------------------------------------------------------------------

const BURY_TRUMP: TrumpModel = { strain: 'H', rank: 7 };

test('埋底不埋分、不埋主，埋副牌最低张', () => {
  const hand = [
    c('H', 14), c('H', 13), c('H', 7), c('H', 5), c('H', 3),
    c('S', 2), c('S', 3), c('S', 13),
    c('D', 4), c('D', 5), c('D', 11),
    c('C', 2), c('C', 3), c('C', 9),
    SJ, c('S', 7), c('D', 7), c('C', 7)
  ];
  const bury = buryFor(hand, BURY_TRUMP);
  assert.equal(bury.length, KITTY_SIZE);
  // 三张全是副牌无分低张；♠3 与 ♣3 同 keep 值时按手牌原顺序取先者（♠3 在前）
  assert.deepEqual(keys(bury), ['C2', 'S2', 'S3']);
  for (const card of bury) {
    assert.equal(cardPoints(card), 0, `不该埋分牌：${cardKey(card)}`);
  }
});

test('埋底恰 3 张且都来自手牌', () => {
  const hand = [...fillers([c('H', 14), c('S', 2), c('C', 2)], 17), c('H', 14), c('S', 2), c('C', 2)];
  const bury = buryFor(hand, BURY_TRUMP);
  assert.equal(bury.length, 3);
  assert.ok(removeCards(hand, bury) !== null);
});

// ---------------------------------------------------------------------------
// 打牌：领出（trump = ♥7 贯穿）
// ---------------------------------------------------------------------------

const T: TrumpModel = { strain: 'H', rank: 7 };

test('领出：副牌 K 在 A 已现身后计牌必赢 → 出 K 收墩', () => {
  const hand = [c('S', 13), c('S', 9), c('H', 14), c('H', 7), c('D', 5), c('D', 8), c('C', 3), c('C', 6)];
  const view = makePlay({ hand, trump: T, history: [played(1, [c('S', 14)])] });
  assert.deepEqual(playFor(view, view.you, T), [c('S', 13)]);
});

test('领出：副牌 A 天然必赢 → 出 A', () => {
  const hand = [
    c('H', 14), c('H', 7), c('H', 3),
    c('S', 13), c('S', 12), c('S', 11), c('S', 10), c('S', 9),
    c('D', 14),
    c('C', 5), c('C', 8), c('C', 10)
  ];
  // ♠K 之上 ♠A 未见、♣10 之上一堆未见 → 都不必赢；♦A 无更大同门 → 必赢
  const view = makePlay({ hand, trump: T });
  assert.deepEqual(playFor(view, view.you, T), [c('D', 14)]);
});

test('领出：计牌顶级主 → 吊主', () => {
  const hand = [BJ, c('H', 14), c('H', 7), c('S', 13), c('S', 9), c('D', 5), c('C', 3), c('C', 6)];
  const view = makePlay({ hand, trump: T });
  assert.deepEqual(playFor(view, view.you, T), [BJ]);
});

test('领出：整手单段顺子且计牌必赢 → 末轮全押（保底/抠底倍数）', () => {
  const hand = [c('S', 14), c('S', 13), c('S', 12), c('S', 11)];
  const view = makePlay({ hand, trump: T });
  assert.deepEqual(keys(playFor(view, view.you, T)), ['S11', 'S12', 'S13', 'S14']);
});

test('领出：混门但层号相连的牌不许当成一顺全押（isRun 不看门类）', () => {
  // ♠ 将、级牌 7：♥Q(层 10) ♠J(层 9) ♠10(层 8) 层号相连，但门类不同 —— 甩牌会被服务端拒绝
  const trump: TrumpModel = { strain: 'S', rank: 7 };
  const hand = [c('H', 12), c('S', 11), c('S', 10)];
  const view = makePlay({ hand, trump });
  const lead = playFor(view, view.you, trump);
  assert.equal(lead.length, 1, `混门不能全押：${keys(lead).join(',')}`);
  assert.equal(checkPlay(hand, lead, trump, null), null, '领出必须合法');
});

// ---------------------------------------------------------------------------
// 打牌：跟牌
// ---------------------------------------------------------------------------

test('跟牌（够门）：桌上有分 → 顶窗便宜压过', () => {
  const hand = [c('S', 14), c('S', 12), c('S', 9), c('H', 14), c('D', 5), c('C', 3)];
  const trick: Trick = { leaderSeat: 1, plays: [{ seat: 1, cards: [c('S', 13)] }] }; // ♠K = 10 分
  const view = makePlay({ hand, trump: T, trick, declarer: 1 });
  assert.deepEqual(playFor(view, view.you, T), [c('S', 14)]);
});

test('跟牌（够门）：无分又非末轮、不缺分 → 底窗让利', () => {
  const hand = [c('S', 13), c('S', 12), c('S', 9), c('H', 14), c('D', 5), c('C', 3)];
  const trick: Trick = { leaderSeat: 1, plays: [{ seat: 1, cards: [c('S', 4)] }] };
  const view = makePlay({ hand, trump: T, trick, declarer: 1 });
  assert.deepEqual(playFor(view, view.you, T), [c('S', 9)]);
});

test('跟牌（结构优先）：领 4 顺持 3 顺+散张 → 必含那个 3 顺', () => {
  const hand = [c('S', 13), c('S', 12), c('S', 11), c('S', 4), c('D', 5), c('C', 3)];
  const lead = [c('S', 5), c('S', 6), c('S', 8), c('S', 9)]; // 级牌 7 跳过 → 相邻
  const trick: Trick = { leaderSeat: 1, plays: [{ seat: 1, cards: lead }] };
  const view = makePlay({ hand, trump: T, trick, declarer: 1 });
  const follow = playFor(view, view.you, T);
  assert.equal(follow.length, 4);
  assert.equal(checkPlay(hand, follow, T, lead), null, `跟牌必须合法：${keys(follow).join(',')}`);
  for (const key of ['S11', 'S12', 'S13']) {
    assert.ok(keys(follow).includes(key), `3 顺必须整体跟出：${keys(follow).join(',')}`);
  }
});

test('跟牌（缺门有分）：最低压得过的主牌杀牌', () => {
  const hand = [c('H', 13), c('H', 12), c('H', 11), c('H', 5), c('C', 3), c('D', 9)];
  const trick: Trick = { leaderSeat: 1, plays: [{ seat: 1, cards: [c('S', 13)] }] }; // ♠K = 10 分
  const view = makePlay({ hand, trump: T, trick, declarer: 1 });
  // 任何主牌单张都压得过 ♠K → 取最低的 ♥5（省高主）
  assert.deepEqual(playFor(view, view.you, T), [c('H', 5)]);
});

test('跟牌（缺门无分）：垫最不心疼的牌', () => {
  const hand = [c('H', 13), c('H', 12), c('C', 3), c('C', 9), c('D', 2)];
  const trick: Trick = { leaderSeat: 1, plays: [{ seat: 1, cards: [c('S', 3)] }] };
  const view = makePlay({ hand, trump: T, trick, declarer: 1 });
  assert.deepEqual(playFor(view, view.you, T), [c('D', 2)]);
});

test('跟牌（末轮）：手牌数 = 领出张数 → 0 分也要赢（保底/抠底）', () => {
  const hand = [c('S', 13), c('S', 12)];
  const lead = [c('S', 5), c('S', 6)];
  const trick: Trick = { leaderSeat: 1, plays: [{ seat: 1, cards: lead }] };
  const view = makePlay({ hand, trump: T, trick, declarer: 1 });
  assert.deepEqual(keys(playFor(view, view.you, T)), ['S12', 'S13']);
});

test('跟牌（该门不足）：先出完该门，其余垫最低', () => {
  const hand = [c('S', 13), c('H', 14), c('H', 5), c('C', 3), c('C', 9)];
  const lead = [c('S', 5), c('S', 6)];
  const trick: Trick = { leaderSeat: 1, plays: [{ seat: 1, cards: lead }] };
  const view = makePlay({ hand, trump: T, trick, declarer: 1 });
  const follow = playFor(view, view.you, T);
  assert.equal(follow.length, 2);
  assert.deepEqual(spades(follow), ['S13'], '仅剩的 ♠K 必须出掉');
  assert.deepEqual(
    follow.map(cardKey).filter((key) => !key.startsWith('S')),
    ['C3'],
    '垫牌取 discardValue 最低者（♣3）'
  );
});
