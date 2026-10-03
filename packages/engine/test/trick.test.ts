import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { trickWinner } from '../src/trick.ts';
import type { Card, Seat } from '../src/cards.ts';
import { BJ, SJ, c } from './helpers.ts';

const T = { strain: 'H' as const, rank: 7 };

function p(seat: Seat, cards: Card[]) {
  return { seat, cards };
}

describe('赢墩判定', () => {
  const lead3 = [c('C', 2), c('C', 3), c('C', 4)];

  it('同门更高顺子获胜', () => {
    const winner = trickWinner([p(0, lead3), p(1, [c('C', 5), c('C', 6), c('C', 8)]), p(2, [c('C', 9), c('C', 10), c('C', 11)])], T);
    assert.equal(winner, 2);
  });

  it('结构性跟牌（3+1）不能赢，即使顶张更大', () => {
    const winner = trickWinner([p(0, lead3), p(1, [c('C', 13), c('C', 14), c('C', 5)])], T);
    assert.equal(winner, 0);
  });

  it('旁门顺子不能赢', () => {
    const winner = trickWinner([p(0, lead3), p(1, [c('D', 2), c('D', 3), c('D', 4)])], T);
    assert.equal(winner, 0);
  });

  it('连续主牌可杀牌并压过副牌', () => {
    const winner = trickWinner([p(0, lead3), p(1, [c('H', 2), c('H', 3), c('H', 4)])], T);
    assert.equal(winner, 1);
  });

  it('更大的主牌顺子压过较小的杀牌', () => {
    const winner = trickWinner([
      p(0, lead3),
      p(1, [c('H', 2), c('H', 3), c('H', 4)]),
      p(2, [c('H', 9), c('H', 10), c('H', 11)])
    ], T);
    assert.equal(winner, 2);
  });

  it('不连续的主牌不能杀牌', () => {
    const winner = trickWinner([p(0, [c('C', 2), c('C', 3)]), p(1, [c('C', 7), c('D', 7)])], T);
    assert.equal(winner, 0);
  });

  it('单张主牌压单张副牌', () => {
    const winner = trickWinner([p(0, [c('S', 14)]), p(1, [c('H', 2)])], T);
    assert.equal(winner, 1);
  });

  it('平张先出为大：两张副级相遇', () => {
    const winner = trickWinner([p(0, [c('C', 7)]), p(1, [c('D', 7)]), p(2, [c('S', 7)])], T);
    assert.equal(winner, 0);
  });

  it('大小王同样遵循先出为大', () => {
    const winner = trickWinner([p(0, [BJ]), p(1, [BJ])], T);
    assert.equal(winner, 0);
  });

  it('主牌领出时只有更大的主牌顺子能赢', () => {
    const winner = trickWinner([
      p(0, [c('H', 2), c('H', 3)]),
      p(1, [c('H', 4), c('H', 5)]),
      p(2, [c('D', 2), c('D', 3)])
    ], T);
    assert.equal(winner, 1);
  });

  it('主牌顺子可含副级与王', () => {
    const t = { strain: 'S' as const, rank: 7 };
    const lead = [c('S', 14), c('C', 7)];
    const winner = trickWinner([p(0, lead), p(1, [c('S', 7), SJ])], t);
    assert.equal(winner, 1);
  });
});
