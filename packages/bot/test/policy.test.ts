/**
 * 策略单测：固定局面 → 期望动作（确定性策略让断言可以钉死到具体牌）。
 * 视图构造直接手写引擎 GameState 再过 `personalView`，与真实服务器的投影同一条路。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cardClass,
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
  /** 底牌（庄家的 `buriedKitty` 就是它）：测「庄家知道自己埋了什么」时要能指定 */
  readonly kitty?: readonly Card[];
}

function makePlay(rig: PlayRig): PersonalView {
  const seat = rig.seat ?? 0;
  const declarer = rig.declarer ?? 0;
  const others = fillers([...rig.hand, ...(rig.kitty ?? [])], 34);
  const kitty = rig.kitty !== undefined ? [...rig.kitty] : others.slice(34, 37);
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
    originalKitty: [...kitty],
    kitty: [...kitty],
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

test('willingPoints 是阶梯映射且封顶 85（门槛 12）', () => {
  assert.equal(willingPoints(11), 0);
  assert.equal(willingPoints(12), 40);
  assert.equal(willingPoints(15), 45);
  assert.equal(willingPoints(18), 50);
  assert.equal(willingPoints(30), 70);
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

test('strengthOf：无主没有杀牌，缺门不加分；长套才是赢墩来源', () => {
  const rank = 7;
  // 只有一门的大牌，另外三门全空
  const hand = [c('C', 14), c('C', 13)];
  assert.equal(strengthOf(hand, rank, 'NT').value, 2, '无主：只算 ♣A 的 +2，缺门不计分');
  // 同一手牌打有主（♦）：♣ 是副门（+2），♥♠ 两门缺门各 +1 —— 有主才吃缺门分
  assert.equal(strengthOf(hand, rank, 'D').value, 4, '有主时缺门才算垫牌/杀牌的空间');
  // 无主的长套算赢墩来源：把 ♣ 补到 4 张 → A(+2) + 长套(+1)
  const longer = [c('C', 14), c('C', 13), c('C', 5), c('C', 4)];
  assert.equal(strengthOf(longer, rank, 'NT').value, 3, '无主：4 张长套另有 +1');
});

test('叫牌：四门大牌铺开、无级牌无王时，最佳花色应当是无主', () => {
  // 级牌 7（我一张 7 都没有 ⇒ 有主的花色只拿到自己那一门），A/K 均匀铺在四门
  const hand = [
    c('C', 14), c('C', 13), c('C', 12), c('C', 3),
    c('D', 14), c('D', 13), c('D', 5), c('D', 6),
    c('H', 14), c('H', 13), c('H', 8), c('H', 9),
    c('S', 14), c('S', 13), c('S', 10), c('S', 11),
    c('C', 4)
  ];
  const view = makeAuction(hand, [], [7, 7, 7]);
  const call = bidFor(view, view.you);
  assert.notEqual(call, 'pass');
  assert.equal(typeof call === 'object' ? call.strain : null, 'NT', `实际叫了 ${JSON.stringify(call)}`);
});

test('埋底恰 3 张且都来自手牌', () => {
  const hand = [...fillers([c('H', 14), c('S', 2), c('C', 2)], 17), c('H', 14), c('S', 2), c('C', 2)];
  const bury = buryFor(hand, BURY_TRUMP);
  assert.equal(bury.length, 3);
  assert.ok(removeCards(hand, bury) !== null);
});

test('埋分博弈：主牌绝对控制（≥10 张）时，把不超过 10 分埋进底', () => {
  // ♥ 将、级牌 7：主牌 10 张（含双王 + 主级 ♥7 + 三张副级 7）⇒ 控制达标
  const hand = [
    BJ, SJ, c('H', 7), c('H', 14), c('H', 13), c('H', 12), c('H', 11), c('H', 9),
    c('S', 7), c('D', 7), c('C', 7),
    // 副牌：分牌 + 够多的零分牌（埋完还要留 ≥3 张非分副牌）
    c('S', 5), c('S', 10), c('S', 2), c('S', 3), c('S', 4),
    c('D', 2), c('D', 3), c('D', 9), c('C', 4)
  ];
  const bury = buryFor(hand, BURY_TRUMP);
  assert.equal(bury.length, KITTY_SIZE);
  const points = bury.reduce((sum, card) => sum + cardPoints(card), 0);
  assert.ok(points > 0, `控制达标时应当埋分，实际埋了 0 分：${keys(bury).join(',')}`);
  assert.ok(points <= 10, `埋分不得超过 10 分，实际 ${points}`);
  // 埋完仍要留得住垫牌
  const rest = hand.filter((card) => !bury.includes(card));
  const nonPointSide = rest.filter((card) => cardClass(card, BURY_TRUMP) !== 'T' && cardPoints(card) === 0);
  assert.ok(nonPointSide.length >= 3, `埋完应留 ≥3 张非分副牌，实际 ${nonPointSide.length}`);
});

test('埋分博弈：控制不达标时仍然一分不埋（默认基线）', () => {
  // 9 张主牌，但顶级主牌只有两张（小王 + 主级 ♥7）⇒ 未达「≥10 张或三张顶级全在」
  const hand = [
    SJ, c('H', 7), c('H', 14), c('H', 13), c('H', 12), c('H', 9),
    c('S', 7), c('D', 7), c('C', 7),
    c('S', 5), c('S', 10), c('S', 2), c('S', 3), c('S', 4),
    c('D', 2), c('D', 3), c('D', 9), c('C', 4), c('C', 6), c('C', 5)
  ];
  const bury = buryFor(hand, BURY_TRUMP);
  const points = bury.reduce((sum, card) => sum + cardPoints(card), 0);
  assert.equal(points, 0, `控制不达标不该埋分，实际埋了 ${points} 分：${keys(bury).join(',')}`);
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

test('领出：混门但层号相连的牌不许当成一顺全押（isRun 不看门类）', () => {
  // ♠ 将、级牌 7：♥Q(层 10) ♠J(层 9) ♠10(层 8) 层号相连，但门类不同 —— 甩牌会被服务端拒绝
  const trump: TrumpModel = { strain: 'S', rank: 7 };
  const hand = [c('H', 12), c('S', 11), c('S', 10)];
  const view = makePlay({ hand, trump });
  const lead = playFor(view, view.you, trump);
  assert.equal(lead.length, 1, `混门不能全押：${keys(lead).join(',')}`);
  assert.equal(checkPlay(hand, lead, trump, null), null, '领出必须合法');
});

test('领出：副牌顺子即使同门无敌也不整手全押（会被缺门杀）', () => {
  const hand = [c('S', 14), c('S', 13), c('S', 12), c('S', 11)];
  const view = makePlay({ hand, trump: T, kitty: [c('H', 10), c('H', 13), c('C', 5)] });
  const lead = playFor(view, view.you, T);
  assert.ok(
    lead.length < hand.length,
    `副牌门不许整手全押（会被同长度主牌顺子杀掉），实际出了 ${keys(lead).join(',')}`
  );
  assert.equal(checkPlay(hand, lead, T, null), null, '领出必须合法');
});

test('领出：主牌顺子整手全押（主牌门无可杀，只有更高的同长度主牌顺子能压，已被排除）', () => {
  // ♥ 将、级牌 2：主级 ♥2(层 14) + 小王(15) + 大王(16) 构成 3 顺，且顶张就是全副牌最大 —— 押得
  const trump: TrumpModel = { strain: 'H', rank: 2 };
  const hand = [BJ, SJ, c('H', 2)];
  const view = makePlay({ hand, trump });
  assert.deepEqual(keys(playFor(view, view.you, trump)), ['H2', 'j0', 'j1']);
});

test('领出：对手已证缺门时，不再把那门顺子当安全领出（改走别的门）', () => {
  // 墩史：座位 0 领 ♠5、座位 1 跟了 ♦3 —— 座位 1 在 ♠ 上**一张都没出** ⇒ 已证 ♠ 缺门
  const history: CompletedTrick[] = [
    {
      leaderSeat: 0,
      plays: [
        { seat: 0, cards: [c('S', 5)] },
        { seat: 1, cards: [c('D', 3)] }
      ],
      winnerSeat: 0,
      points: 0
    }
  ];
  const hand = [c('S', 14), c('S', 13), c('S', 12), c('D', 5), c('D', 9), c('H', 14), c('H', 7)];
  const view = makePlay({ hand, trump: T, history });
  const lead = playFor(view, view.you, T);
  assert.equal(lead.length, 1, `♠ 已知会被杀，不该多张领出：${keys(lead).join(',')}`);
  assert.ok(
    cardClass(lead[0]!, T) !== 'S',
    `已知 ♠ 缺门的对手在场，不该再领 ♠：${keys(lead).join(',')}`
  );
});

test('领出：庄家自己埋掉的牌不算威胁（闲家看不到底牌，庄家知道自己埋了什么）', () => {
  const hand = [c('S', 13), c('S', 9), c('H', 14), c('H', 7), c('H', 3)];
  // 庄家把 ♠A 埋了 ⇒ ♠K 已是这门最大 ⇒ 出它
  const declarerView = makePlay({ hand, trump: T, kitty: [c('S', 14), c('D', 2), c('D', 3)] });
  assert.deepEqual(playFor(declarerView, declarerView.you, T), [c('S', 13)]);
  // 闲家：底牌不可见，♠A 仍可能在外面 ⇒ 不敢当安全领出，退到最低张
  const defenderView = makePlay({ hand, trump: T, declarer: 1 });
  assert.deepEqual(playFor(defenderView, defenderView.you, T), [c('S', 9)]);
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
