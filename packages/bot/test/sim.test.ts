/**
 * 机器重演（ADR-0016）单测。
 *
 * 核心是**回环一致性**：真实机器人桌（`fullgame.test.ts` 同款直驱）与 `simulateDeal`
 * 对同一副牌、同一副前级别必须演出**同一个结局** —— 打成的副给出逐字相同的结算摘要，
 * 全 pass 重发的副重演也报全 pass。这同时证明两个分支都真实可达（非空转）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cardsPoints,
  createGame,
  dispatch,
  newDeal,
  personalView,
  START_LEVEL,
  type Action,
  type GameState,
  type Seat
} from '@sixty/engine';
import { moveFor } from '../src/policy.ts';
import { simulateDeal, type ReplayInput } from '../src/sim.ts';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inputOf(seed: number, levels = [START_LEVEL, START_LEVEL, START_LEVEL]): ReplayInput {
  const deal = newDeal(1, (seed % 3) as Seat, mulberry32(seed));
  return {
    hands: deal.hands.map((hand) => [...hand]),
    originalKitty: [...deal.originalKitty],
    dealerSeat: deal.dealerSeat,
    dealNo: deal.dealNo,
    levels: levels.map((level) => ({ ...level }))
  };
}

/** 此刻该谁行动（scored / 无牌局 → null） */
function actorOf(state: GameState): Seat | null {
  const deal = state.deal;
  if (deal === null) return null;
  if (deal.phase === 'auction') return ((deal.dealerSeat + deal.auction.length) % 3) as Seat;
  if (deal.phase === 'bury') return deal.contract!.declarerSeat;
  if (deal.phase === 'play') return ((deal.trick!.leaderSeat + deal.trick!.plays.length) % 3) as Seat;
  return null;
}

function step(state: GameState, rng: () => number): GameState {
  const actor = actorOf(state);
  assert.ok(actor !== null, 'step 只在有人可动时调用');
  const view = personalView(state, actor);
  const move = moveFor(view, view.you);
  assert.ok(move !== null, `座位 ${actor}（${state.deal!.phase}）给不出动作`);
  const res = dispatch(state, { ...move, seat: actor } as Action, rng);
  assert.ok(res.ok, `机器人动作被拒：${res.ok ? '' : res.message}`);
  return res.state;
}

test('确定性：同一副重演两遍，结果逐字相同', () => {
  for (const seed of [1, 7, 42]) {
    const a = JSON.stringify(simulateDeal(inputOf(seed)));
    const b = JSON.stringify(simulateDeal(inputOf(seed)));
    assert.equal(a, b, `seed=${seed} 重演必须完全可复现`);
  }
});

test('打完的副：终态自洽（分守恒算上底牌、底牌三张、算式成立、级牌取自副前级别）', () => {
  let scored = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const result = simulateDeal(inputOf(seed));
    if (result.kind !== 'scored') continue;
    scored += 1;
    const { summary } = result;
    assert.equal(summary.dealNo, 1, '重演回报的是同一副');
    // 全牌面恰 100 分：墩上抓的分 + 埋进底的分 = 100（引擎 game.test 同款守恒）
    assert.equal(
      summary.declarerTrickPoints + summary.defenderTrickPoints,
      100 - summary.kittyPoints,
      '分守恒（含底牌）'
    );
    assert.equal(summary.kitty.length, 3, '机器人庄家埋了 3 张');
    assert.equal(summary.kittyPoints, cardsPoints(summary.kitty), '底分与埋下的牌一致');
    assert.equal(
      summary.finalScore,
      summary.declarerTrickPoints +
        (summary.protectedBottom ? summary.multiplier * summary.kittyPoints : -summary.multiplier * summary.kittyPoints),
      '结算公式'
    );
    assert.equal(summary.made, summary.finalScore >= summary.contract.points, '打成判定');
    assert.equal(
      summary.trump.rank,
      inputOf(seed).levels[summary.contract.declarerSeat]!.rank,
      '级牌点数取自（重演里的）庄家副前级别'
    );
  }
  assert.ok(scored >= 20, `24 个种子里应几乎都打成（实际 ${scored}）`);
});

test('回环一致：真实机器人桌与重演对同一副演出同一结局（含全 pass 分支）', () => {
  let compared = 0;
  let redealOutcomes = 0;

  for (let seed = 1; seed <= 24 && redealOutcomes < 3; seed++) {
    const rng = mulberry32(seed);
    let state: GameState = createGame((seed % 3) as Seat);

    for (let steps = 0; state.status === 'playing' && steps < 30_000; ) {
      // 需要发牌（还没牌 / 上一副已结算）就先发一副
      if (state.deal === null || state.deal.phase === 'scored') {
        const res = dispatch(state, { type: 'deal' }, rng);
        assert.ok(res.ok);
        state = res.state;
        steps += 1;
      }
      // 此刻是一副全新 auction 牌局（发牌后或全 pass 重发后）：快照全部输入
      const deal = state.deal!;
      const input: ReplayInput = {
        hands: deal.hands.map((hand) => [...hand]),
        originalKitty: [...deal.originalKitty],
        dealerSeat: deal.dealerSeat,
        dealNo: deal.dealNo,
        levels: state.levels.map((level) => ({ ...level }))
      };

      // 真桌把这副打到底（或打到重发）
      let inner = 0;
      for (; inner < 5000; inner++) {
        const current = state.deal!;
        if (current.phase === 'scored') {
          const sim = simulateDeal(input);
          assert.equal(sim.kind, 'scored', `seed=${seed} 第 ${input.dealNo} 副：真桌打成，重演应同样打成`);
          assert.equal(
            sim.kind === 'scored' ? JSON.stringify(sim.summary) : '',
            JSON.stringify(current.summary),
            `seed=${seed} 第 ${input.dealNo} 副：重演摘要必须与真桌逐字相同`
          );
          compared += 1;
          break;
        }
        state = step(state, rng);
        if (state.deal!.dealNo !== input.dealNo) {
          const sim = simulateDeal(input);
          assert.equal(
            sim.kind,
            'all-pass',
            `seed=${seed} 第 ${input.dealNo} 副：真桌全 pass 重发，重演应报 all-pass（实际 ${sim.kind}）`
          );
          redealOutcomes += 1;
          compared += 1;
          break;
        }
      }
      assert.ok(inner < 5000, `seed=${seed} 第 ${input.dealNo} 副步数超限`);
    }
  }

  assert.ok(compared >= 30, `应比对至少 30 副（实际 ${compared}）`);
  assert.ok(
    redealOutcomes >= 1,
    `24 个种子里一个全 pass 重发都没遇到（实际 ${redealOutcomes}）——重演的全 pass 分支没被走到`
  );
});

test('重演不改动输入：手牌与底牌原样', () => {
  const input = inputOf(5);
  simulateDeal(input);
  for (const [seat, hand] of input.hands.entries()) {
    assert.equal(hand.length, 17, `座位 ${seat} 手牌未被重演改动`);
  }
  assert.equal(input.originalKitty.length, 3, '底牌未被重演改动');
});
