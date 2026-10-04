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
  createGame,
  dispatch,
  personalView,
  type Action,
  type GameState,
  type RNG,
  type Seat
} from '@sixty/engine';
import { moveFor } from '../src/policy.ts';

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
}

function playOut(seed: number): PlayOut {
  const rng = mulberry32(seed);
  let state = createGame((seed % 3) as Seat);
  let steps = 0;
  let botMoves = 0;
  let scoredDeals = 0;
  let redeals = 0;

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
    const action = { ...move, seat: actor } as Action;
    const before = state.deal!.dealNo;
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

  return { state, steps, botMoves, scoredDeals, redeals };
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

test('全 pass 重发存在但不失控（重发数 < 结算副数 × 3）', () => {
  let totalRedeals = 0;
  let totalDeals = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const out = cachedPlayOut(seed);
    totalRedeals += out.redeals;
    totalDeals += out.scoredDeals;
  }
  assert.ok(totalDeals > 0);
  // 弱牌过频会让牌局变成「重发模拟器」；3 倍上限是宽松的健康线
  assert.ok(
    totalRedeals < totalDeals * 3,
    `重发 ${totalRedeals} 次 / 结算 ${totalDeals} 副：机器人叫牌太保守`
  );
});
