/**
 * 整局属性测试：三个机器人策略直驱引擎打完整场对局。
 *
 * 不变量：
 * 1. 轮到机器人时 `moveFor` 永远给得出动作（驱动器不会卡死在机器人回合）；
 * 2. 每个动作都被引擎接受（策略「合法即构造」的证明）；
 * 3. 对局有限步内结束（全 pass 重发也终会成局）；
 * 4. 同一种子完全可复现（策略确定性 + RNG 注入）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cardClass,
  classOfSet,
  createGame,
  dispatch,
  personalView,
  topLevel,
  type Action,
  type Card,
  type GameState,
  type RNG,
  type Seat,
  type TrumpModel
} from '@sixty/engine';
import { moveFor } from '../src/policy.ts';
import { extractChains } from '../src/sight.ts';

const SEEDS = Number(process.env['BOT_SEEDS'] ?? 24);
const STEP_CAP = 60_000;

function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 此刻该谁行动（scored / 无牌局 → null：该「发牌」了，驱动器里这是人类的活） */
function actorOf(state: GameState): Seat | null {
  const deal = state.deal;
  if (deal === null) return null;
  if (deal.phase === 'auction') return ((deal.dealerSeat + deal.auction.length) % 3) as Seat;
  if (deal.phase === 'bury') return deal.contract!.declarerSeat;
  if (deal.phase === 'play') return ((deal.trick!.leaderSeat + deal.trick!.plays.length) % 3) as Seat;
  return null;
}

interface PlayOut {
  readonly state: GameState;
  readonly steps: number;
  readonly botMoves: number;
  readonly scoredDeals: number;
  readonly redeals: number;
  /** 开叫机会与被开叫的次数（衡量叫牌进取度） */
  readonly openings: number;
  readonly opened: number;
  /** 末轮整手全押的次数，以及其中「对手有合法且能赢的牌」的违规次数 */
  readonly allIns: number;
  readonly beatableAllIns: number;
}

/**
 * 对手有没有「合法且能赢」的牌来压过我这次多张领出 —— 用引擎的获胜条件直接判，不做枚举。
 *
 * 引擎规定只有「与领出同长度的单段顺子」能赢，于是只有三条路：
 * 1. 领出是主牌门 → 只能靠更高的同长度主牌顺子（层号更高）；
 * 2. 领出是副门、对手该门够 → 同门更高的同长度顺子（结构优先天然满足：最优分解就是它）；
 * 3. 领出是副门、对手该门缺门 → 同长度主牌顺子杀牌（缺门时才能纯出主牌）。
 * 比「枚举组合」快得多，也就不会为了快而悄悄漏判。
 */
function canOpponentBeat(hand: readonly Card[], lead: readonly Card[], t: TrumpModel): boolean {
  const n = lead.length;
  const leadCls = classOfSet(lead, t)!;
  const myTop = topLevel(lead, t);
  const trumps = hand.filter((card) => cardClass(card, t) === 'T');
  const same = hand.filter((card) => cardClass(card, t) === leadCls);
  const runBeats = (cards: readonly Card[]): boolean => {
    for (const chain of extractChains(cards, t)) {
      if (chain.length < n) continue;
      if (leadCls !== 'T') return true; // 副门领出：任意同长度主牌顺子都压得过
      if (topLevel(chain.slice(chain.length - n), t) > myTop) return true;
    }
    return false;
  };
  if (leadCls === 'T') return runBeats(trumps);
  if (same.length >= n && runBeats(same)) return true;
  if (same.length === 0 && runBeats(trumps)) return true;
  return false;
}

function playOut(seed: number): PlayOut {
  const rng = mulberry32(seed);
  let state = createGame((seed % 3) as Seat);
  let steps = 0;
  let botMoves = 0;
  let scoredDeals = 0;
  let redeals = 0;
  let openings = 0;
  let opened = 0;
  let allIns = 0;
  let beatableAllIns = 0;

  while (state.status === 'playing' && steps < STEP_CAP) {
    const actor = actorOf(state);
    if (actor === null) {
      const res = dispatch(state, { type: 'deal' }, rng);
      assert.ok(res.ok, `seed=${seed} 发牌被拒：${res.ok ? '' : res.message}`);
      state = res.state;
      steps += 1;
      continue;
    }
    const view = personalView(state, actor);
    const move = moveFor(view, view.you);
    assert.ok(move !== null, `seed=${seed} 第 ${steps} 步：轮到座位 ${actor}（${state.deal!.phase}）却给不出动作`);

    const deal = state.deal!;
    if (deal.phase === 'auction' && deal.auction.length === 0 && move.type === 'bid') {
      openings += 1;
      if (move.call !== 'pass') opened += 1;
    }
    // 多张领出：全押（把手牌一次打光）必须是「对手压不过」的，这才是全押的前提
    if (
      deal.phase === 'play' &&
      move.type === 'play' &&
      deal.trick !== null &&
      deal.trick.plays.length === 0 &&
      move.cards.length === view.you.hand.length &&
      move.cards.length >= 2
    ) {
      allIns += 1;
      const opponents = ([0, 1, 2] as Seat[]).filter((s) => s !== actor);
      const trump = deal.trump!;
      if (opponents.some((s) => canOpponentBeat(deal.hands[s]!, move.cards, trump))) beatableAllIns += 1;
    }

    const action = { ...move, seat: actor } as Action;
    const before = deal.dealNo;
    const res = dispatch(state, action, rng);
    assert.ok(
      res.ok,
      `seed=${seed} 第 ${steps} 步机器人动作被拒（${JSON.stringify(action)}）：${res.ok ? '' : res.message}`
    );
    state = res.state;
    steps += 1;
    botMoves += 1;
    if (state.deal!.dealNo > before) redeals += 1; // 全 pass 重发
    if (state.deal !== null && state.deal.phase === 'scored') scoredDeals += 1;
  }

  return { state, steps, botMoves, scoredDeals, redeals, openings, opened, allIns, beatableAllIns };
}

/** 结果缓存：三个用例都要跑同一批种子，没必要把整局重算三遍（复现性用例仍走未缓存的 playOut） */
const cache = new Map<number, PlayOut>();

function cachedPlayOut(seed: number): PlayOut {
  const hit = cache.get(seed);
  if (hit !== undefined) return hit;
  const out = playOut(seed);
  cache.set(seed, out);
  return out;
}

test(`${SEEDS} 个种子：三个机器人打完整场，动作全被接受`, () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const out = cachedPlayOut(seed);
    assert.equal(out.state.status, 'finished', `seed=${seed} 应在有限步内结束`);
    assert.ok(out.scoredDeals >= 1, `seed=${seed} 至少结算一副`);
    assert.ok(out.botMoves >= 30, `seed=${seed} 机器人动作数异常少（${out.botMoves}）`);
  }
});

test('同一种子完全可复现（策略确定性）', () => {
  for (const seed of [1, 7, 42]) {
    const a = playOut(seed);
    const b = playOut(seed);
    assert.equal(JSON.stringify(a.state.history), JSON.stringify(b.state.history), `seed=${seed} 结算历史复现`);
    assert.equal(a.steps, b.steps, `seed=${seed} 步数复现`);
    assert.equal(a.botMoves, b.botMoves, `seed=${seed} 动作数复现`);
  }
});

test('全 pass 重发不失控（门槛 12 之后实测 3–5%，这里卡 50%）', () => {
  let totalRedeals = 0;
  let totalDeals = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const out = cachedPlayOut(seed);
    totalRedeals += out.redeals;
    totalDeals += out.scoredDeals;
  }
  assert.ok(totalDeals > 0);
  assert.ok(
    totalRedeals < totalDeals * 0.5,
    `重发 ${totalRedeals} 次 / 结算 ${totalDeals} 副：叫牌太保守（初版门槛 15 实测 36%）`
  );
});

test('叫牌够进取：一半以上的开叫机会有人开叫', () => {
  let openings = 0;
  let opened = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const out = cachedPlayOut(seed);
    openings += out.openings;
    opened += out.opened;
  }
  assert.ok(openings > 0);
  // 这条只受 `BotParams.bidBar` 影响（门槛 12 ⇒ 实测 ~54%）；ADR-0017 把**竞叫阶梯**
  // 也参数化了，但那动的是「要不要把别人的庄家位抢过来」，与本条的读数无关 ——
  // 所以这里钉住不动，是为了让「门槛被谁调低了」这件事单独看得见。
  assert.ok(
    opened / openings >= 0.5,
    `开叫率只有 ${((opened / openings) * 100).toFixed(1)}%：门槛又变保守了（门槛 12 实测 ~54%）`
  );
});

test('整手领出只出现在可证压不过的局面（可被压过的次数为 0）', () => {
  let allIns = 0;
  let violations = 0;
  const perSeed: string[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const out = cachedPlayOut(seed);
    allIns += out.allIns;
    violations += out.beatableAllIns;
    if (out.beatableAllIns > 0) perSeed.push(`seed=${seed}:${out.beatableAllIns}`);
  }
  // 这条断言覆盖两件事：① 全押（主牌门整手一押）压不过；② 残局里「副门窗口正好等于整手」
  // 也不能把整手一次打出去（否则就是副门上的 x 倍下注）—— 它们用同一个判据：领出整手必须压不过。
  assert.equal(violations, 0, `有 ${violations} 次整手领出能被对手合法压过（${perSeed.join(' ')}）`);
  // 断言不能空转：这批种子里必须**真的出现过**整手领出，否则上面那条什么都没守住
  assert.ok(allIns > 0, '这批判牌里一次整手领出都没发生 —— 该断言是空转的，需要扩大种子数');
});
