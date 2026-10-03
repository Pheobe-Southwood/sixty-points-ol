/**
 * 个人视图的可见性守卫：底牌只对庄家提前可见。
 *
 * 规则口径（见 CONTEXT.md 的 **底牌**）：发牌留下的 3 张在成交后就并进庄家的手牌，
 * 所以对庄家不是新信息 —— 个人视图把它们一并交出，好让界面点明「哪三张是拿上来的」；
 * 闲家到结算（`summary.originalKitty`）才看得到。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SEATS, type Card, type Seat } from '../src/cards.ts';
import { createGame, dispatch, playTurn, type Action, type GameState } from '../src/state.ts';
import { personalView } from '../src/view.ts';
import { mulberry32, randomLegalAction } from './helpers.ts';

/** 走完整的一副：叫牌 → 埋底 → 打牌 → 结算，每一步都断言三家的可见性 */
function walkOneDeal(seed: number): { final: GameState } {
  const rng = mulberry32(seed);
  let state = createGame(0);
  let steps = 0;
  let sawBury = false;
  let sawPlay = false;

  while (steps < 20000) {
    const deal = state.deal;
    if (deal !== null && deal.phase === 'scored' && deal.summary !== null) {
      // 结算后：summary 里的底牌对三家都公开，数量与发牌留下的一致
      for (const seat of SEATS) {
        const view = personalView(state, seat);
        assert.equal(
          view.deal?.summary?.originalKitty.length,
          3,
          `seed=${seed} 结算后底牌应对所有人可见`
        );
      }
      assert.ok(sawBury, `seed=${seed} 这一副应当经过埋底阶段`);
      assert.ok(sawPlay, `seed=${seed} 这一副应当经过出牌阶段`);
      return { final: state };
    }

    if (deal !== null) {
      const declarerSeat = deal.contract?.declarerSeat ?? null;
      for (const seat of SEATS) {
        const view = personalView(state, seat);
        const kitty = view.deal?.originalKitty ?? null;
        if (deal.phase === 'auction' || declarerSeat === null) {
          assert.equal(kitty, null, `seed=${seed} 叫牌阶段任何人都不该看到底牌`);
          continue;
        }
        if (seat === declarerSeat) {
          assert.equal(kitty?.length, 3, `seed=${seed} 庄家应当看得到 3 张底牌`);
          assert.deepEqual(
            (kitty ?? []).map(key).sort(),
            deal.originalKitty.map(key).sort(),
            `seed=${seed} 庄家看到的底牌应与牌局一致`
          );
          // 庄家看得见 = 因为他手里本来就有这 20 张；埋完 3 张就回到 17（打牌中再逐轮减少）
          if (deal.phase === 'bury') {
            assert.equal(view.you.hand.length, 20, `seed=${seed} 埋底阶段庄家手牌应为 20 张`);
          } else if (deal.trick?.plays.length === 0 && deal.trickHistory.length === 0) {
            assert.equal(view.you.hand.length, 17, `seed=${seed} 出牌第 1 轮庄家手牌应为 17 张`);
          }
        } else {
          assert.equal(kitty, null, `seed=${seed} 闲家（座位 ${seat}）不该看到底牌`);
        }
      }
      if (deal.phase === 'bury') sawBury = true;
      if (deal.phase === 'play') sawPlay = true;
    }

    const action: Action = randomLegalAction(state, rng);
    const result = dispatch(state, action, rng);
    assert.ok(result.ok, `seed=${seed} 第 ${steps} 步被拒：${result.ok ? '' : result.message}`);
    if (!result.ok) break;
    state = result.state;
    steps += 1;
  }
  throw new Error(`seed=${seed} 没能在 20000 步内走完一副`);
}

function key(card: Card): string {
  return 'joker' in card ? `joker:${card.joker}` : `${card.suit}${card.rank}`;
}

describe('个人视图：底牌可见性', () => {
  it('叫牌阶段对所有人隐藏；成交后只对庄家可见；结算后对所有人公开', () => {
    for (const seed of [1, 4, 9]) walkOneDeal(seed);
  });

  it('闲家看到的底牌恒为 null —— 直到结算才随 summary 公开', () => {
    const rng = mulberry32(11);
    let state = createGame(0);
    let steps = 0;
    let checkedDefender = false;

    while (steps < 20000) {
      const deal = state.deal;
      if (deal !== null && deal.contract !== null && deal.phase !== 'scored') {
        const declarer = deal.contract.declarerSeat;
        const defender = ((declarer + 1) % 3) as Seat;
        const view = personalView(state, defender);
        assert.equal(view.deal?.originalKitty, null, '闲家不该看到底牌');
        assert.equal(view.you.isDeclarer, false);
        checkedDefender = true;
      }
      if (deal !== null && deal.phase === 'scored') break;
      const result = dispatch(state, randomLegalAction(state, rng), rng);
      if (!result.ok) break;
      state = result.state;
      steps += 1;
    }

    assert.ok(checkedDefender, '这副牌应当至少检查到一次成交后的闲家视图');
  });

  it('庄家的 originalKitty 与结算里的 originalKitty 是同一组牌', () => {
    const rng = mulberry32(23);
    let state = createGame(0);
    let captured: { seat: Seat; kitty: string[] } | null = null;
    let steps = 0;

    while (steps < 20000) {
      const deal = state.deal;
      if (deal !== null && deal.phase === 'bury' && deal.contract !== null) {
        const seat = deal.contract.declarerSeat;
        const view = personalView(state, seat);
        captured = { seat, kitty: (view.deal?.originalKitty ?? []).map(key).sort() };
      }
      if (deal !== null && deal.phase === 'scored' && deal.summary !== null) {
        assert.ok(captured !== null, '应当先经过埋底阶段');
        assert.deepEqual(
          deal.summary.originalKitty.map(key).sort(),
          captured!.kitty,
          '结算公开的底牌应与庄家埋底时看到的一致'
        );
        return;
      }
      const result = dispatch(state, randomLegalAction(state, rng), rng);
      if (!result.ok) break;
      state = result.state;
      steps += 1;
    }
    throw new Error('没能在 20000 步内走完一副');
  });

  it('出牌阶段的轮次提示仍然只在座位上（视图不因新增字段而改变轮次语义）', () => {
    const rng = mulberry32(31);
    let state = createGame(0);
    let checked = 0;
    let steps = 0;
    while (steps < 20000) {
      const deal = state.deal;
      if (deal !== null && deal.phase === 'play') {
        const turn = playTurn(deal);
        for (const seat of SEATS) {
          const view = personalView(state, seat);
          assert.equal(view.deal?.playTurn, turn);
          assert.equal(view.you.seat, seat);
        }
        checked += 1;
        break;
      }
      const result = dispatch(state, randomLegalAction(state, rng), rng);
      if (!result.ok) break;
      state = result.state;
      steps += 1;
    }
    assert.ok(checked > 0, '应当走到出牌阶段');
  });
});
