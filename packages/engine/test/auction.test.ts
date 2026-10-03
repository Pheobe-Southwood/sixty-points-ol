import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateCall } from '../src/auction.ts';
import { createGame, dispatch, type DispatchResult, type GameState } from '../src/state.ts';
import { mulberry32, c } from './helpers.ts';

const rng = mulberry32(20240707);

function expectOk(res: DispatchResult): Extract<DispatchResult, { ok: true }> {
  if (!res.ok) throw new Error(`预期成功，实际 ${res.code}: ${res.message}`);
  return res;
}

function expectErr(res: DispatchResult): Extract<DispatchResult, { ok: false }> {
  if (res.ok) throw new Error('预期失败，实际成功');
  return res;
}

function startedGame(): GameState {
  return expectOk(dispatch(createGame(0), { type: 'deal' }, rng)).state;
}

describe('叫品合法性', () => {
  it('起步 40、步长 5', () => {
    assert.match(validateCall({ points: 35, strain: 'C' }, null) ?? '', /40/);
    assert.match(validateCall({ points: 41, strain: 'C' }, null) ?? '', /5/);
    assert.equal(validateCall({ points: 40, strain: 'C' }, null), null);
    assert.equal(validateCall({ points: 105, strain: 'NT' }, null), null);
  });

  it('分数为主序、花色为次序（C<D<H<S<NT）', () => {
    assert.match(validateCall({ points: 40, strain: 'C' }, { points: 40, strain: 'C' }) ?? '', /高于/);
    assert.equal(validateCall({ points: 40, strain: 'D' }, { points: 40, strain: 'C' }), null);
    assert.equal(validateCall({ points: 40, strain: 'NT' }, { points: 40, strain: 'S' }), null);
    assert.match(validateCall({ points: 40, strain: 'S' }, { points: 40, strain: 'NT' }) ?? '', /高于/);
    assert.equal(validateCall({ points: 45, strain: 'C' }, { points: 40, strain: 'NT' }), null);
  });

  it('pass 永远合法', () => {
    assert.equal(validateCall('pass', { points: 200, strain: 'NT' }), null);
  });
});

describe('叫牌流程', () => {
  it('发牌后 17/17/17 + 3 张底牌', () => {
    const state = startedGame();
    const deal = state.deal!;
    assert.equal(deal.phase, 'auction');
    assert.deepEqual(deal.hands.map((h) => h.length), [17, 17, 17]);
    assert.equal(deal.originalKitty.length, 3);
    assert.equal(deal.hands.flat().length + deal.originalKitty.length, 54);
  });

  it('轮次与合法性校验', () => {
    const state = startedGame();
    assert.equal(expectErr(dispatch(state, { type: 'bid', seat: 1, call: 'pass' }, rng)).code, 'not_your_turn');
    assert.equal(expectErr(dispatch(state, { type: 'bid', seat: 0, call: { points: 35, strain: 'C' } }, rng)).code, 'illegal_bid');
  });

  it('连续两家 pass 即成交，庄家拿底后进入埋底', () => {
    let state = startedGame();
    state = expectOk(dispatch(state, { type: 'bid', seat: 0, call: { points: 40, strain: 'C' } }, rng)).state;
    state = expectOk(dispatch(state, { type: 'bid', seat: 1, call: 'pass' }, rng)).state;
    assert.equal(state.deal!.phase, 'auction', '仅一家 pass 时叫牌继续');
    state = expectOk(dispatch(state, { type: 'bid', seat: 2, call: 'pass' }, rng)).state;

    const deal = state.deal!;
    assert.equal(deal.phase, 'bury');
    assert.deepEqual(deal.contract, { points: 40, strain: 'C', declarerSeat: 0 });
    assert.equal(deal.hands[0]!.length, 20);
    assert.equal(deal.trump!.strain, 'C');
    assert.equal(deal.trump!.rank, state.levels[0]!.rank);
  });

  it('中途加叫需要重新凑齐两家 pass', () => {
    let state = startedGame();
    state = expectOk(dispatch(state, { type: 'bid', seat: 0, call: { points: 40, strain: 'C' } }, rng)).state;
    state = expectOk(dispatch(state, { type: 'bid', seat: 1, call: 'pass' }, rng)).state;
    state = expectOk(dispatch(state, { type: 'bid', seat: 2, call: { points: 45, strain: 'D' } }, rng)).state;
    state = expectOk(dispatch(state, { type: 'bid', seat: 0, call: 'pass' }, rng)).state;
    assert.equal(state.deal!.phase, 'auction');
    state = expectOk(dispatch(state, { type: 'bid', seat: 1, call: 'pass' }, rng)).state;
    assert.deepEqual(state.deal!.contract, { points: 45, strain: 'D', declarerSeat: 2 });
  });

  it('级牌取庄家级别', () => {
    let state = startedGame();
    state.levels[0] = { rank: 11, cycle: 1 };
    state = expectOk(dispatch(state, { type: 'bid', seat: 0, call: { points: 40, strain: 'NT' } }, rng)).state;
    state = expectOk(dispatch(state, { type: 'bid', seat: 1, call: 'pass' }, rng)).state;
    state = expectOk(dispatch(state, { type: 'bid', seat: 2, call: 'pass' }, rng)).state;
    assert.equal(state.deal!.trump!.rank, 11);
    assert.equal(state.deal!.trump!.strain, 'NT');
  });

  it('三家全 pass → 重发，级别不变、发牌人轮转', () => {
    let state = startedGame();
    const before = state.levels.map((l) => ({ ...l }));
    state = expectOk(dispatch(state, { type: 'bid', seat: 0, call: 'pass' }, rng)).state;
    state = expectOk(dispatch(state, { type: 'bid', seat: 1, call: 'pass' }, rng)).state;
    state = expectOk(dispatch(state, { type: 'bid', seat: 2, call: 'pass' }, rng)).state;
    assert.equal(state.dealNo, 2);
    assert.equal(state.dealerSeat, 1);
    assert.equal(state.deal!.phase, 'auction');
    assert.deepEqual(state.levels, before);
    assert.equal(state.history.length, 0);
  });
});

describe('埋底', () => {
  function toBury(): GameState {
    let state = startedGame();
    state = expectOk(dispatch(state, { type: 'bid', seat: 0, call: { points: 40, strain: 'S' } }, rng)).state;
    state = expectOk(dispatch(state, { type: 'bid', seat: 1, call: 'pass' }, rng)).state;
    return expectOk(dispatch(state, { type: 'bid', seat: 2, call: 'pass' }, rng)).state;
  }

  it('只有庄家能埋、必须 3 张、必须在手里', () => {
    const state = toBury();
    const hand = state.deal!.hands[0]!;
    assert.equal(expectErr(dispatch(state, { type: 'bury', seat: 1, cards: hand.slice(0, 3) }, rng)).code, 'not_declarer');
    assert.equal(expectErr(dispatch(state, { type: 'bury', seat: 0, cards: hand.slice(0, 2) }, rng)).code, 'bury_size');
    assert.equal(
      expectErr(dispatch(state, { type: 'bury', seat: 0, cards: [c('C', 2), c('C', 3), c('C', 4)] }, rng)).code,
      'not_in_hand'
    );
  });

  it('埋底后进入出牌，庄家先领出', () => {
    const state = toBury();
    const cards = state.deal!.hands[0]!.slice(0, 3);
    const after = expectOk(dispatch(state, { type: 'bury', seat: 0, cards }, rng)).state;
    const deal = after.deal!;
    assert.equal(deal.phase, 'play');
    assert.equal(deal.hands[0]!.length, 17);
    assert.equal(deal.trick!.leaderSeat, 0);
    assert.deepEqual(deal.kitty, cards);
  });
});
