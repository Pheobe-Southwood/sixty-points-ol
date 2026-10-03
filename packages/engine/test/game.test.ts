import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cardsPoints, type Seat } from '../src/cards.ts';
import { createGame, dispatch, levelProgress, type GameState } from '../src/state.ts';
import { mulberry32, randomLegalAction } from './helpers.ts';

const SEEDS = Number(process.env['GAME_SEEDS'] ?? 60);
const STEP_CAP = 40000;

function playOut(seed: number): { state: GameState; steps: number; deals: number; seed: number } {
  const rng = mulberry32(seed);
  let state = createGame((seed % 3) as Seat);
  let steps = 0;
  let deals = 0;

  while (state.status === 'playing' && steps < STEP_CAP) {
    const action = randomLegalAction(state, rng);
    const res = dispatch(state, action, rng);
    assert.ok(
      res.ok,
      `seed=${seed} 第 ${steps} 步动作被拒（${JSON.stringify(action)}）：${res.ok ? '' : `${res.code} ${res.message}`}`
    );
    if (!res.ok) break;
    state = res.state;
    steps += 1;

    const deal = state.deal;
    if (deal === null) continue;

    if (deal.phase === 'play' && (deal.trick === null || deal.trick.plays.length === 0)) {
      const sizes = deal.hands.map((h) => h.length);
      assert.equal(sizes[0], sizes[1], `seed=${seed} 轮次之间手牌数应相等`);
      assert.equal(sizes[1], sizes[2], `seed=${seed} 轮次之间手牌数应相等`);
    }

    if (deal.phase === 'scored') {
      const captured = deal.captured.flat();
      assert.equal(captured.length + deal.kitty.length, 54, `seed=${seed} 牌数守恒`);
      assert.equal(cardsPoints(captured) + cardsPoints(deal.kitty), 100, `seed=${seed} 分数守恒`);
      const s = deal.summary!;
      const expected =
        s.declarerTrickPoints +
        (s.protectedBottom ? s.multiplier * s.kittyPoints : -s.multiplier * s.kittyPoints);
      assert.equal(s.finalScore, expected, `seed=${seed} 结算公式`);
      assert.equal(s.made, s.finalScore >= s.contract.points, `seed=${seed} 打成判定`);
      assert.equal(s.multiplier, s.lastTrickSize, `seed=${seed} 底牌倍数 = 末轮张数`);
      deals += 1;
    }
  }

  return { state, steps, deals, seed };
}

describe('随机整局不变量', () => {
  it(`${SEEDS} 个种子全部跑到结束，每一步动作都被引擎接受`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { state, deals } = playOut(seed);
      assert.equal(state.status, 'finished', `seed=${seed} 应在有限步内结束（已完成 ${deals} 副）`);
      assert.ok(deals >= 1, `seed=${seed} 至少打完一副`);

      const progress = state.levels.map(levelProgress);
      assert.deepEqual(state.result!.progress, progress, `seed=${seed} 结果进度与级别一致`);
      assert.ok(
        progress.filter((p) => p >= 27).length >= 2 || progress.filter((p) => p >= 40).length >= 1,
        `seed=${seed} 结束条件成立`
      );

      const ranking = state.result!.ranking;
      assert.equal(ranking.length, 3);
      for (let i = 1; i < ranking.length; i++) {
        assert.ok(
          progress[ranking[i - 1]!]! >= progress[ranking[i]!]!,
          `seed=${seed} 排名按总进度降序`
        );
      }
    }
  });

  it('同一种子完全可复现（含每副结算）', () => {
    for (const seed of [1, 7, 42]) {
      const a = playOut(seed);
      const b = playOut(seed);
      assert.equal(JSON.stringify(a.state.history), JSON.stringify(b.state.history), `seed=${seed} 复现`);
      assert.deepEqual(a.state.levels, b.state.levels, `seed=${seed} 级别复现`);
      assert.equal(a.steps, b.steps, `seed=${seed} 步数复现`);
    }
  });

  it('对局必然产生升级：结束后至少一方进度前移', () => {
    const { state } = playOut(3);
    assert.ok(state.history.length >= 1);
    const moved = state.history.flatMap((h) => h.levelChanges).length;
    assert.ok(moved >= 1, '每副结算都应有升级记录');
  });
});
