/**
 * 紧凑投影：形状清单、观战者不泄漏、编码无损、history 压缩不丢计分，以及
 * 「投影只能从服务器的负载里派生」这条机械证据（静态守卫）。
 *
 * 这一层是 ADR-0010「引擎类型逐字」被收窄的地方（见 ADR-0011），所以它必须自己证明
 * 自己没有变成第二个来源：不 import 任何能碰到牌局的东西，只做**单向**的翻译。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isJoker, personalView, publicView, type Card, type PlayerSeat } from '@sixty/engine';
import { decodeCard, encodeCard } from '../src/codec.ts';
import {
  COMPACT_DEAL_FIELDS,
  COMPACT_HISTORY_FIELDS,
  COMPACT_SEAT_FIELDS,
  COMPACT_SUMMARY_FIELDS,
  COMPACT_TABLE_FIELDS,
  COMPACT_TRICK_FIELDS,
  COMPACT_VIEW_FIELDS,
  COMPACT_YOU_FIELDS,
  HISTORY_LIMIT,
  decodePlay,
  project,
  type CompactPayload
} from '../src/project.ts';
import { fakeTableView, scoredState, scoredStateWithHistory } from './fake-api.ts';

/** 牌史最长的那一刻：一副打完、已结算 */
const STATE = scoredState();
const RAW = publicView(STATE);
const YOU = personalView(STATE, 0).you;

function compactOf(you: PlayerSeat | null = YOU): CompactPayload {
  return project({ role: you === null ? 'spectator' : 'player', view: RAW, you, table: fakeTableView('ABC123') }, 'ABC123');
}

const keysOf = (value: object): string => Object.keys(value).sort().join(',');
const expected = (fields: readonly string[]): string => [...fields].sort().join(',');

/** 把一侧的牌都掏出来（紧凑侧先解码），用于「编码无损」的多重集比较 */
function codesOf(cards: readonly Card[]): string[] {
  return cards.map((card) => (isJoker(card) ? `joker-${card.joker}` : `${card.suit}-${card.rank}`)).sort();
}
function multisetFrom(list: readonly (readonly Card[])[]): string[] {
  return codesOf(list.flat());
}

test('投影后的字段清单与声明逐字一致（多一个少一个都算漂移）', () => {
  const compact = compactOf();
  assert.equal(keysOf(compact.view!), expected(COMPACT_VIEW_FIELDS), 'CompactView');
  assert.equal(keysOf(compact.view!.deal!), expected(COMPACT_DEAL_FIELDS), 'CompactDeal');
  assert.equal(keysOf(compact.view!.deal!.trickHistory[0]!), expected(COMPACT_TRICK_FIELDS), 'CompactCompletedTrick');
  assert.equal(keysOf(compact.view!.deal!.summary!), expected(COMPACT_SUMMARY_FIELDS), 'CompactSummary');
  assert.equal(keysOf(compact.view!.history[0]!), expected(COMPACT_HISTORY_FIELDS), 'CompactHistoryRow');
  assert.equal(keysOf(compact.table), expected(COMPACT_TABLE_FIELDS), 'CompactTable');
  assert.equal(keysOf(compact.table.seats[0]!), expected(COMPACT_SEAT_FIELDS), 'CompactSeat');
  assert.equal(keysOf(compact.you!), expected(COMPACT_YOU_FIELDS), 'CompactYou');
});

test('可推的字段不重复给：已完成的墩不带 leaderSeat（第一墩庄家领出，之后上墩赢家领出）', () => {
  const deal = compactOf().view!.deal!;
  const raw = RAW.deal!;
  for (const [index, trick] of deal.trickHistory.entries()) {
    const expectedLeader = index === 0 ? raw.declarerSeat : raw.trickHistory[index - 1]!.winnerSeat;
    assert.equal(raw.trickHistory[index]!.leaderSeat, expectedLeader, '推出来的领出者与服务器给的不一致');
    assert.equal('leaderSeat' in trick, false, '已完成的墩不该再重复给 leaderSeat');
  }
  // 当前这一墩仍要给出领出者（它是出牌的直接约束来源）
  assert.ok(deal.trick === null || typeof deal.trick.leaderSeat === 'number');
});

test('只减不增：重复与私有字段都不出现在投影里', () => {
  const compact = compactOf();
  assert.equal('captured' in compact.view!.deal!, false, 'captured[].cards 与 trickHistory 逐张重复，不该再给一份');
  assert.equal('kitty' in compact.view!.deal!, false);
  assert.equal('userId' in compact.table.seats[0]!, false);
  assert.equal('spectatorCount' in compact.table, false);
  assert.deepEqual(compact.view!.deal!.capturedPoints, RAW.deal!.captured.map((entry) => entry.points));
  assert.deepEqual(compact.view!.deal!.handCounts, [...RAW.deal!.handCounts]);
});

test('丢掉 captured[].cards 确实不丢信息：它与 trickHistory 是同一批牌', () => {
  const captured = multisetFrom(RAW.deal!.captured.map((entry) => entry.cards));
  const tricked = multisetFrom(RAW.deal!.trickHistory.map((trick) => trick.plays.flatMap((play) => play.cards)));
  assert.deepEqual(captured, tricked, 'captured 与 trickHistory 不是同一批牌 —— 那「删掉一份」就没有依据');
  assert.equal(captured.length, 51, '一副牌打出的牌应当是 51 张');
});

test('紧凑编码无损：解码回来的牌与服务器给的逐张一致', () => {
  const raw = [...RAW.deal!.trickHistory.flatMap((trick) => trick.plays.flatMap((play) => play.cards))];
  const lines = compactOf().view!.deal!.trickHistory.flatMap((trick) => trick.plays);
  const decoded = lines.flatMap((line) =>
    decodePlay(line).cards.map((code) => {
      const card = decodeCard(code);
      assert.ok(card !== null, `投影吐出了认不出的牌码：${code}`);
      return card;
    })
  );
  assert.deepEqual(codesOf(decoded), codesOf(raw));

  // 一手牌那个写法本身也要能还原：座位与「哪几张是一手出的」都不能丢
  const firstRaw = RAW.deal!.trickHistory[0]!.plays;
  const firstCompact = compactOf().view!.deal!.trickHistory[0]!.plays;
  assert.equal(firstCompact.length, firstRaw.length);
  for (const [index, line] of firstCompact.entries()) {
    const parsed = decodePlay(line);
    assert.equal(parsed.seat, firstRaw[index]!.seat);
    assert.deepEqual([...parsed.cards], firstRaw[index]!.cards.map(encodeCard));
  }
});

test('history 压成计分行，但计分需要的字段一个不少', () => {
  const compact = compactOf().view!.history;
  assert.equal(compact.length, RAW.history.length);
  for (const [index, row] of compact.entries()) {
    const original = RAW.history[index]!;
    assert.equal(row.dealNo, original.dealNo);
    assert.deepEqual(row.contract, original.contract);
    assert.equal(row.finalScore, original.finalScore);
    assert.equal(row.made, original.made);
    assert.equal(row.shortfall, original.shortfall);
    assert.deepEqual(row.levelChanges, original.levelChanges);
  }
  // 本副的完整摘要仍给足（结算那一刻是唯一需要细节的时候），只是牌面也换成了紧凑码
  const summary = compactOf().view!.deal!.summary!;
  const raw = RAW.deal!.summary!;
  assert.equal(summary.finalScore, raw.finalScore);
  assert.equal(summary.made, raw.made);
  assert.equal(summary.shortfall, raw.shortfall);
  assert.deepEqual(summary.contract, raw.contract);
  assert.deepEqual(summary.levelChanges, raw.levelChanges);
  assert.deepEqual(summary.kitty, raw.kitty.map(encodeCard));
  assert.deepEqual(summary.originalKitty, raw.originalKitty.map(encodeCard));
});

test('history 有个上限：更早的副只裁明细、如实报数，当前局势仍在 levels/progress', () => {
  const total = HISTORY_LIMIT + 2;
  const state = scoredStateWithHistory(total);
  const view = publicView(state);
  const compact = project(
    { role: 'player', view, you: personalView(state, 0).you, table: fakeTableView('ABC123') },
    'ABC123'
  ).view!;

  assert.equal(view.history.length, total, '服务器那份当然还是全的（浏览器要看完整战报）');
  assert.equal(compact.history.length, HISTORY_LIMIT);
  assert.equal(compact.historyOmitted, total - HISTORY_LIMIT);
  assert.deepEqual(
    compact.history.map((row) => row.dealNo),
    Array.from({ length: HISTORY_LIMIT }, (_, index) => total - HISTORY_LIMIT + index + 1),
    '留下的必须是最新的那几副'
  );
  assert.deepEqual(compact.levels, view.levels, '级别与进度不受裁剪影响');
  assert.deepEqual(compact.progress, view.progress);

  // 一局通常打不到这个上限（实测 7 副上下），那时必须一副都不裁
  const short = project(
    { role: 'player', view: publicView(scoredState()), you: YOU, table: fakeTableView('ABC123') },
    'ABC123'
  ).view!;
  assert.equal(short.historyOmitted, 0);
  assert.equal(short.history.length, 1);
});

test('观战者：投影里没有 you，也就没有任何手牌', () => {
  const spectator = compactOf(null);
  assert.equal(spectator.role, 'spectator');
  assert.equal(spectator.you, null);
  const raw = JSON.stringify(spectator);
  assert.equal(raw.includes('"hand"'), false, '观战者的负载里出现了手牌');
  assert.ok(raw.includes('"handCounts"'), '公开信息里应该只剩各家张数');
});

test('体积：结算时投影至少省掉四成', () => {
  const raw = JSON.stringify({ code: 'ABC123', role: 'player', table: fakeTableView('ABC123'), view: RAW, you: YOU });
  const compact = JSON.stringify(compactOf());
  assert.ok(
    compact.length * 1.4 < raw.length,
    `投影没省下多少：${compact.length} vs ${raw.length}（结算时）`
  );
});

test('不许有第二个来源：project.ts 只 import 引擎类型与本包编解码', () => {
  const source = readFileSync(new URL('../src/project.ts', import.meta.url), 'utf8');
  const modules = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.deepEqual(
    [...new Set(modules)].sort(),
    ['./codec.ts', './wire.ts', '@sixty/engine'],
    'project.ts 引入了别的模块：投影必须只从服务器负载单向派生'
  );
  for (const forbidden of ['dispatch', 'personalView', 'publicView', 'createGame', 'structuredClone']) {
    assert.equal(
      new RegExp(`\\b${forbidden}\\b`).test(source.replace(/\/\*[\s\S]*?\*\//g, '')),
      false,
      `project.ts 里出现了 ${forbidden}：投影不该有能力自己造局面`
    );
  }
});

test('座位信息齐全但精简：seat/name/online 都在，userId 不在', () => {
  const seats = compactOf().table.seats;
  assert.equal(seats.length, 3);
  assert.deepEqual(
    seats.map((seat) => seat.seat),
    [0, 1, 2]
  );
  for (const seat of seats) {
    assert.equal(typeof seat.online, 'boolean');
    assert.ok(seat.name === null || typeof seat.name === 'string');
  }
});
