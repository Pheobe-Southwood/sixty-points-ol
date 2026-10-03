/**
 * 工具层单测：纯逻辑，零网络、零 SDK。
 *
 * 快照用自己的 FakeApi（内存版服务器，见 fake-api.ts）产出，
 * 但规则判定一律由引擎给出 —— 所以这里断言的是「工具面有没有如实转达规则」，
 * 而不是「规则对不对」（后者是 packages/engine 的事）。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cardClass,
  checkPlay as engineCheckPlay,
  HELP_KEYS,
  validateCall,
  type PlayerSeat,
  type PublicView,
  type Strain
} from '@sixty/engine';
import { ApiError } from '../src/api.ts';
import { callTool, ToolError, toolByName, TOOLS, type ToolRuntime, type TurnSummary } from '../src/tools.ts';
import type { TableSummary } from '../src/wire.ts';
import { contractState, FakeApi, playingState } from './fake-api.ts';

interface BidRow {
  readonly points: number;
  readonly strains: readonly string[];
}

function runtime(api: FakeApi, extra: Partial<ToolRuntime> = {}): ToolRuntime {
  return { api, pollMs: 1000, defaultWaitSeconds: 30, ...extra };
}

async function call<T = unknown>(
  name: string,
  api: FakeApi,
  args: unknown = {},
  extra: Partial<ToolRuntime> = {}
): Promise<T> {
  const spec = toolByName(name);
  assert.ok(spec !== undefined, `工具表里没有 ${name}`);
  return (await callTool(spec, runtime(api, extra), args)) as T;
}

test('工具表：13 个工具且名字不重复', () => {
  const names = TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length, '工具名有重复');
  assert.deepEqual([...names].sort(), [
    'bid',
    'bury',
    'check_play',
    'create_table',
    'deal',
    'get_state',
    'join_table',
    'legal_bids',
    'list_my_tables',
    'new_game',
    'play',
    'read_rules',
    'wait_for_turn'
  ]);
  for (const tool of TOOLS) {
    assert.ok(tool.description.length > 10, `${tool.name} 缺少能看懂的描述`);
  }
});

test('get_state：公共视图 + you 分开给，并说清现在轮到谁', async () => {
  const api = new FakeApi(); // dealer 0、座位 0 → 开叫的正是自己
  const state = await call<{ code: string; role: string; view: PublicView; you: PlayerSeat; turn: TurnSummary }>(
    'get_state',
    api
  );

  assert.equal(state.code, 'ABC123');
  assert.equal(state.role, 'player');
  assert.equal(state.you.hand.length, 17);
  assert.equal(state.you.seat, 0);
  assert.equal(state.turn.phase, 'auction');
  assert.equal(state.turn.isYourTurn, true);
  assert.equal(state.turn.canAct, true);
});

test('get_state：不是自己的回合时 canAct 为假（别人叫牌中）', async () => {
  const api = new FakeApi({ seat: 1 }); // 首副由座位 0 先叫
  const state = await call<{ turn: TurnSummary }>('get_state', api);
  assert.equal(state.turn.isYourTurn, false);
  assert.equal(state.turn.canAct, false);
  assert.match(state.turn.hint, /wait_for_turn/);
});

test('隐藏信息不出门：公共视图里不含手牌与底牌，只有各家张数', async () => {
  const api = new FakeApi();
  const state = await call<{ view: PublicView; you: PlayerSeat }>('get_state', api);
  const rawView = JSON.stringify(state.view);

  for (const forbidden of ['"hand"', 'originalKitty', '"kitty"', '"hands"', '"you"']) {
    assert.equal(rawView.includes(forbidden), false, `公共视图里出现了 ${forbidden}`);
  }
  assert.ok(rawView.includes('handCounts'), '公开信息里应该只有各家的张数');
  // 自己那一份照旧给足，否则玩家没法出牌
  assert.equal(state.you.hand.length, 17);
});

test('观战者拿不到 you：只有公共视图，且不能动手', async () => {
  const api = new FakeApi({ state: playingState(), seat: null });
  const state = await call<{ role: string; view: PublicView; you: PlayerSeat | null; turn: TurnSummary }>(
    'get_state',
    api
  );

  assert.equal(state.role, 'spectator');
  assert.equal(state.you, null, '观战者不该拿到手牌');
  assert.ok(state.view.deal !== null, '观战者仍应看到公共局面');
  assert.equal(state.turn.canAct, false);
  assert.match(state.turn.hint, /观战/);

  // check_play 也不能替观战者猜牌
  const verdict = await call<{ ok: boolean; error: string }>('check_play', api, { cards: [{ suit: 'C', rank: 5 }] });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error, /观战/);

  // 动作会被服务端按「观战者」拒绝（这一层只负责原话转达）
  await assert.rejects(() => call('play', api, { cards: [{ suit: 'C', rank: 5 }] }), /服务器拒绝：你在观战/);
});

test('wait_for_turn：观战者不该空转到超时，立刻说清楚', async () => {
  const api = new FakeApi({ state: playingState(), seat: null });
  let slept = 0;
  const out = await call<{ role: string; timedOut: boolean; turn: TurnSummary }>('wait_for_turn', api, {}, {
    sleep: async () => {
      slept += 1;
    }
  });
  assert.equal(out.role, 'spectator');
  assert.equal(slept, 0, '观战者没有座位，等多久都不会轮到，不该轮询');
  assert.equal(out.turn.canAct, false);
});

test('legal_bids：每个候选都用引擎 validateCall 反查为合法', async () => {
  const api = new FakeApi();
  const out = await call<{ options: BidRow[] }>('legal_bids', api);
  const flat = out.options.flatMap((row) => row.strains.map((strain) => ({ points: row.points, strain: strain as Strain })));
  assert.ok(flat.length > 0, '开局至少要有 40 分的候选');
  for (const bid of flat) {
    assert.equal(validateCall(bid, null), null, `${bid.points}${bid.strain} 其实不合法`);
  }
  assert.equal(out.options[0]!.points, 40);
  assert.deepEqual(out.options[0]!.strains, ['C', 'D', 'H', 'S', 'NT']);
});

test('legal_bids：有人叫了 45♥ 之后，同分只剩更高的花色、低分全部消失', async () => {
  const api = new FakeApi();
  await call('bid', api, { call: { points: 45, strain: 'H' } });
  const out = await call<{ options: BidRow[]; highestBid: { points: number; strain: string } }>('legal_bids', api);

  assert.deepEqual(out.highestBid, { points: 45, strain: 'H' });
  assert.equal(out.options.find((row) => row.points === 45)?.strains.join(''), 'SNT');
  assert.equal(out.options.filter((row) => row.points < 45).length, 0);
  assert.equal(out.options[0]!.points, 45);
});

test('check_play：把引擎的裁决原话转达（非法则 ok=false）', async () => {
  const api = new FakeApi({ state: playingState(), seat: 0 });
  const payload = await call<{ view: PublicView; you: PlayerSeat }>('get_state', api);
  const view = payload.view;
  const trump = view.deal!.trump!;
  const hand = payload.you.hand;

  // 领出多张必须同门：挑两张门类不同的牌，这个选择一定非法。
  // 门类要用引擎的 cardClass 判（级牌与王都是主牌），不能只看 suit ——
  // ♣2 与 ♦2 花色不同却是同一门，这种选择错在「不成顺子」而不是「不同门」。
  const first = hand[0]!;
  const other = hand.find((card) => cardClass(card, trump) !== cardClass(first, trump));
  assert.ok(other !== undefined, '17 张牌不可能全是一个门类');

  const expected = engineCheckPlay(hand, [first, other], trump, null);
  assert.notEqual(expected, null, '两张不同门类的牌不该构成合法领出');

  const bad = await call<{ ok: boolean; error: string | null }>('check_play', api, { cards: [first, other] });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, expected, '工具面必须原话转达引擎的裁决');

  const good = await call<{ ok: boolean; error: string | null }>('check_play', api, { cards: [first] });
  assert.equal(good.ok, true);
  assert.equal(good.error, null);
});

test('check_play：不是出牌阶段时明说，而不是假装合法', async () => {
  const api = new FakeApi(); // 叫牌阶段
  const out = await call<{ ok: boolean; error: string }>('check_play', api, {
    cards: [{ suit: 'C', rank: 5 }]
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, '现在不是出牌阶段');
});

test('动作永不带 seat：座位一律由服务端推导', async () => {
  const auction = new FakeApi();
  await call('bid', auction, { call: 'pass' });
  assert.deepEqual(auction.actions[0], { type: 'bid', call: 'pass' });
  assert.equal(Object.hasOwn(auction.actions[0] as object, 'seat'), false);

  const bury = new FakeApi({ state: contractState(), seat: 0 });
  const buryYou = (await call<{ you: PlayerSeat }>('get_state', bury)).you;
  const three = buryYou.hand.slice(0, 3);
  await call('bury', bury, { cards: three });
  assert.deepEqual(bury.actions[0], { type: 'bury', cards: three });

  const play = new FakeApi({ state: playingState(), seat: 0 });
  const playYou = (await call<{ you: PlayerSeat }>('get_state', play)).you;
  await call('play', play, { cards: [playYou.hand[0]] });
  assert.deepEqual(play.actions[0], { type: 'play', cards: [playYou.hand[0]] });
});

test('服务端拒绝原样转成人话（形状由传输层转成 isError）', async () => {
  const api = new FakeApi({ failWith: new ApiError('还没轮到你叫牌', 400) });
  await assert.rejects(
    () => call('bid', api, { call: 'pass' }),
    (error: unknown) => error instanceof ToolError && error.message === '服务器拒绝：还没轮到你叫牌'
  );
});

test('参数格式不正确时点名是哪个字段', async () => {
  const api = new FakeApi();
  await assert.rejects(() => call('play', api, { cards: [] }), /参数格式不正确：cards/);
  await assert.rejects(() => call('bury', api, { cards: [{ suit: 'C', rank: 5 }] }), /参数格式不正确：cards/);
  await assert.rejects(() => call('play', api, { cards: [{ suit: 'X', rank: 5 }] }), /参数格式不正确：cards/);
});

test('wait_for_turn：轮到自己就立刻返回，不睡', async () => {
  const api = new FakeApi();
  let slept = 0;
  const out = await call<{ timedOut: boolean }>('wait_for_turn', api, {}, {
    sleep: async () => {
      slept += 1;
    }
  });
  assert.equal(out.timedOut, false);
  assert.equal(slept, 0, '已经轮到自己了还睡了一次');
});

test('wait_for_turn：timeout_seconds=0 时不睡也不挂住', async () => {
  const api = new FakeApi({ seat: 1 });
  let slept = 0;
  const out = await call<{ timedOut: boolean; turn: TurnSummary }>(
    'wait_for_turn',
    api,
    { timeout_seconds: 0 },
    {
      sleep: async () => {
        slept += 1;
      }
    }
  );
  assert.equal(out.timedOut, true);
  assert.equal(out.turn.canAct, false);
  assert.equal(slept, 0);
});

test('wait_for_turn：真等一秒会轮询多次（不是空转）', async () => {
  const api = new FakeApi({ seat: 1 });
  const out = await call<{ timedOut: boolean }>('wait_for_turn', api, { timeout_seconds: 1 }, { pollMs: 500 });
  assert.equal(out.timedOut, true);
  assert.ok(api.reads >= 2, `至少应读两次局面，实际 ${api.reads}`);
});

test('还没发牌时 get_state 可用，deal 之后进入叫牌', async () => {
  const api = new FakeApi({ state: null });
  const before = await call<{ view: null; you: null; turn: TurnSummary }>('get_state', api);
  assert.equal(before.view, null);
  assert.equal(before.you, null, '还没发牌时没有手牌可给');
  assert.equal(before.turn.phase, 'lobby');
  assert.equal(before.turn.canAct, true);
  assert.match(before.turn.hint, /deal/);

  const after = await call<{ view: PublicView; you: PlayerSeat }>('deal', api);
  assert.equal(after.view.deal?.phase, 'auction');
  assert.equal(after.you.hand.length, 17);
  assert.deepEqual(api.actions, [{ type: 'deal' }]);
});

test('code 可省略：只有一张桌时自动用它并把码归一成大写', async () => {
  const one = new FakeApi({ tables: [{ code: 'abc123', seated: 1, role: 'player' }] });
  const state = await call<{ code: string }>('get_state', one, {});
  assert.equal(state.code, 'ABC123');
});

test('code 可省略：多张桌必须指名，一张都没有时指路 join_table', async () => {
  const many = new FakeApi({
    tables: [
      { code: 'AAA111', seated: 1, role: 'player' },
      { code: 'BBB222', seated: 3, role: 'spectator' }
    ]
  });
  await assert.rejects(() => call('get_state', many, {}), /AAA111、BBB222/);

  const none = new FakeApi({ tables: [] });
  await assert.rejects(() => call('get_state', none, {}), /join_table/);
});

test('read_rules：默认返回全部阶段（含观战）、指定 key 只回一段、key 写错点名合法值', async () => {
  const api = new FakeApi();
  const all = await call<{ entries: { key: string }[] }>('read_rules', api);
  assert.deepEqual(
    all.entries.map((e) => e.key),
    [...HELP_KEYS],
    'read_rules 的段列表必须与引擎的 HELP_KEYS 完全一致（不多不少、顺序相同）'
  );
  assert.ok(all.entries.length >= 9, '观战那段也要在');

  const one = await call<{ entries: { key: string; lines: string[] }[] }>('read_rules', api, { key: 'scored' });
  assert.equal(one.entries.length, 1);
  assert.equal(one.entries[0]!.key, 'scored');
  assert.ok(one.entries[0]!.lines.join('\n').includes('ceil'), '升级表那段必须讲到 ceil');

  await assert.rejects(() => call('read_rules', api, { key: 'nope' }), /key 只能是/);
});

test('桌面工具：查桌 / 建桌 / 入座', async () => {
  const api = new FakeApi();
  const list = await call<{ tables: readonly TableSummary[] }>('list_my_tables', api);
  assert.deepEqual(list.tables, [{ code: 'ABC123', seated: 3, role: 'player' }]);

  const created = await call<{ code: string }>('create_table', api);
  assert.equal(created.code, 'NEW111');

  const entered = await call<{ code: string }>('join_table', api, { code: 'new111' });
  assert.deepEqual(api.entered, ['NEW111'], '邀请码应先归一大写再进桌');
  assert.equal(entered.code, 'NEW111');
});
