/**
 * 牌局故事的核心测试：种子 → 回放 → 说明标签 → 导出/导入。
 *
 * 这一层是「网页上的牌局讲解不会与规则漂移」的保证：牌面、赢家、墩分、结算全都由引擎现算，
 * 测试直接把回放结果与引擎的独立结论对一遍。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { cardClass, cardKey, cardsPoints, fullDeck, isRun, SEATS, trickWinner, type Card, type TrumpModel } from '@sixty/engine';

import { DEFAULT_NAMES } from '../src/lib/story/types.ts';
import { TUTORIAL_NAMES } from '../src/lib/tutorial/scenarios.ts';
import { mulberry32, seedToUint32, storyRng } from '../src/lib/story/rng.ts';
import { initialState, isCardKey, replayStory, turnSeat } from '../src/lib/story/replay.ts';
import { annotateStep, annotateTrick, cardsSummary, runningPoints } from '../src/lib/story/annotate.ts';
import {
  buildStory,
  draftFromStory,
  parseStoryJson,
  SLUG_PATTERN,
  storyFilename,
  storyToJson
} from '../src/lib/story/export.ts';
import { createDraft, defaultSlug, nowIso, validateSetup } from '../src/lib/story/draft.ts';
import { truncateActions, tryAppend } from '../src/lib/story/append.ts';
import type { DealStory, DraftSetup, StoryAction, StorySpec, StoryStep } from '../src/lib/story/types.ts';
import { pickLegalPlay, playOut, testSpec } from './story-playout.ts';

const SPEC = testSpec('sixty-story-test');

function setupOf(overrides: Partial<DraftSetup> = {}): DraftSetup {
  return {
    seed: SPEC.seed,
    dealerSeat: SPEC.dealerSeat,
    levels: SPEC.levels,
    names: DEFAULT_NAMES,
    title: '测试牌局',
    slug: 'test-deal',
    ...overrides
  };
}

test('rng：同一种子必定同一副牌，不同种子不同', () => {
  const a = storyRng('seed-a');
  const b = storyRng('seed-a');
  const c = storyRng('seed-b');
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notDeepEqual([c(), c(), c()], [a(), a(), a()]);
  // 哈希自身也要稳定（种子是牌局的身份证，不能随实现漂）
  assert.equal(seedToUint32('seed-a'), seedToUint32('seed-a'));
  assert.notEqual(seedToUint32('seed-a'), seedToUint32('seed-b'));
  assert.ok(seedToUint32('') !== 0, '空种子也要给非零状态，否则 mulberry32 退化');
  const direct = mulberry32(42);
  assert.ok(direct() >= 0 && direct() < 1);
});

test('发牌：三家 17 张 + 3 张暗底，54 张不重不漏', () => {
  const result = replayStory(SPEC, [{ type: 'deal', note: null }]);
  assert.equal(result.error, null);
  assert.deepEqual(
    result.state.deal?.hands.map((hand) => hand.length),
    [17, 17, 17]
  );
  assert.equal(result.state.deal?.originalKitty.length, 3);
  const all = [
    ...result.state.deal!.hands.flat(),
    ...result.state.deal!.originalKitty
  ].map(cardKey);
  assert.equal(new Set(all).size, 54, '54 张牌不该重复或缺失');
  assert.deepEqual([...all].sort(), fullDeck().map(cardKey).sort());
  // 级别是级别，级牌是级牌：本副三家都是 5(+0)，所以将牌只在叫牌成交后才存在
  assert.deepEqual(result.state.levels, SPEC.levels);
  assert.equal(result.state.deal?.trump, null, '还没叫牌就不该有将牌');
  assert.equal(turnSeat(result.state), 0, '发牌人先叫牌');
});

test('完整打一副：每一步都合法，且结算自洽', () => {
  const { actions, result } = playOut(SPEC);
  assert.equal(result.error, null, `回放出错：${JSON.stringify(result.error)}`);
  assert.equal(result.state.deal?.phase, 'scored', '这副牌应当打到结算');

  const summary = result.state.deal!.summary!;
  assert.equal(summary.contract.declarerSeat, result.state.deal!.contract!.declarerSeat);
  // 三家每人都出了 17 张：所有墩的张数之和必须等于 17
  const totalSize = result.tricks.reduce((sum, trick) => sum + (trick.plays[0]?.cards.length ?? 0), 0);
  assert.equal(totalSize, 17, `17 个牌位没有出满（实际 ${totalSize}）`);

  let expectedPoints = 0;
  for (const trick of result.tricks) {
    assert.equal(trick.plays.length, 3, '一墩必须三家各出一手');
    const size = trick.plays[0]!.cards.length;
    assert.ok(
      trick.plays.every((play) => play.cards.length === size),
      '同一墩三家出牌张数必须相同'
    );
    assert.ok(
      new Set(trick.plays.map((play) => play.seat)).size === 3,
      '同一墩里同一家不该出两次'
    );
    // 赢家与墩分必须是引擎独立算出来的同一个结论
    assert.equal(trickWinner(trick.plays, result.state.deal!.trump!), trick.winnerSeat);
    const cards = trick.plays.flatMap((play) => play.cards);
    assert.equal(cardsPoints(cards), trick.points);
    expectedPoints += trick.points;
  }

  // 100 分恒等式：庄家 + 闲家 + 底牌 = 100
  const running = runningPoints(result.state);
  assert.equal(running.declarer, summary.declarerTrickPoints);
  assert.equal(running.defenders, summary.defenderTrickPoints);
  assert.equal(running.declarer + running.defenders, expectedPoints);
  assert.equal(running.declarer + running.defenders + running.kitty, 100);
  // 末轮张数就是倍数，且与底牌分一起决定最终得分
  const last = result.tricks[result.tricks.length - 1]!;
  assert.equal(summary.multiplier, last.plays[0]!.cards.length);
  const sign = summary.protectedBottom ? 1 : -1;
  assert.equal(summary.finalScore, summary.declarerTrickPoints + sign * summary.kittyPoints * summary.multiplier);
  assert.equal(summary.made, summary.finalScore >= summary.contract.points);
  assert.ok(actions.length > 20, `动作序列太短（${actions.length} 步），看起来没打完`);
});

test('重发：三家不叫会换发牌人重开，且动作序列照样完整回放', () => {
  const spec = testSpec('sixty-redeal');
  const actions: StoryStep[] = [{ type: 'deal', note: null }, { type: 'bid', seat: 0, call: 'pass', note: null }];
  const firstBid = replayStory(spec, actions);
  assert.equal(firstBid.error, null);
  const secondSeat = turnSeat(firstBid.state);
  assert.equal(secondSeat, 1);

  const threePasses: StoryStep[] = [
    { type: 'deal', note: null },
    { type: 'bid', seat: 0, call: 'pass', note: null },
    { type: 'bid', seat: 1, call: 'pass', note: null },
    { type: 'bid', seat: 2, call: 'pass', note: null }
  ];
  const redealt = replayStory(spec, threePasses);
  assert.equal(redealt.error, null);
  assert.equal(redealt.steps[3]!.redeal, true, '第三步不叫之后应当标记为重发');
  assert.equal(redealt.state.deal?.dealerSeat, 1, '重发后换下一位发牌人');
  assert.equal(redealt.state.deal?.phase, 'auction');
  assert.notDeepEqual(
    redealt.state.deal?.hands.map((hand) => hand.map(cardKey)),
    firstBid.state.deal?.hands.map((hand) => hand.map(cardKey)),
    '重发必须重新洗牌'
  );
  // 重发之后接着打完，仍然应当能正常结算（RNG 实例跨重发连续推进）
  const after = playOut(spec, { bidPlan: ['pass', 'pass', 'pass', { points: 40, strain: 'C' }, 'pass', 'pass'] });
  assert.equal(after.result.error, null);
  assert.equal(after.result.state.deal?.phase, 'scored');
});

test('非法动作被拒：报错要指出是第几步、为什么', () => {
  const opening: StoryStep[] = [
    { type: 'deal', note: null },
    { type: 'bid', seat: 0, call: { points: 40, strain: 'C' }, note: null },
    { type: 'bid', seat: 1, call: 'pass', note: null },
    { type: 'bid', seat: 2, call: 'pass', note: null },
    { type: 'bury', seat: 0, cards: binder(0), note: null }
  ];
  const ready = replayStory(SPEC, opening);
  assert.equal(ready.error, null);
  const hand = ready.state.deal!.hands[0]!;
  const pair = findNonRunPair(hand, ready.state.deal!.trump!);
  assert.notEqual(pair, null, '手牌里竟找不到一对不能一起领出的牌');

  const illegalLead = replayStory(SPEC, [
    ...opening,
    { type: 'play', seat: 0, cards: pair!.map(cardKey), note: null }
  ]);
  assert.notEqual(illegalLead.error, null);
  assert.equal(illegalLead.error?.index, 5);
  assert.match(illegalLead.error?.message ?? '', /顺子|同门/);

  const outOfTurn = replayStory(SPEC, [
    { type: 'deal', note: null },
    { type: 'bid', seat: 2, call: { points: 40, strain: 'C' }, note: null }
  ]);
  assert.equal(outOfTurn.error?.index, 1);
  assert.match(outOfTurn.error?.message ?? '', /还没轮到你/);

  const badKey = replayStory(SPEC, [
    { type: 'deal', note: null },
    { type: 'play', seat: 0, cards: ['Z9'], note: null }
  ]);
  assert.equal(badKey.error?.index, 1);
  assert.match(badKey.error?.message ?? '', /牌键不存在/);
  assert.equal(isCardKey('Z9'), false);
  assert.equal(isCardKey('C10'), true);
  assert.equal(isCardKey('j1'), true);
});

/** 找一对不能当领出的两张（优先同门但不相邻，退而求其次跨门） */
function findNonRunPair(hand: readonly Card[], trump: TrumpModel): [Card, Card] | null {
  let mixed: [Card, Card] | null = null;
  for (let i = 0; i < hand.length; i += 1) {
    for (let j = i + 1; j < hand.length; j += 1) {
      const a = hand[i]!;
      const b = hand[j]!;
      if (cardClass(a, trump) === cardClass(b, trump)) {
        if (!isRun([a, b], trump)) return [a, b];
      } else if (mixed === null) {
        mixed = [a, b];
      }
    }
  }
  return mixed;
}

/** 取发牌后某家的前三张牌（测试里埋底用；必须是那一手牌里真实存在的键） */
function binder(seat: number, spec: StorySpec = SPEC): string[] {
  const result = replayStory(spec, [{ type: 'deal', note: null }]);
  return result.state.deal!.hands[seat]!.slice(0, 3).map(cardKey);
}

test('说明标签：由牌局事实现算，不是手写的', () => {
  const { actions, result } = playOut(SPEC);
  const names: readonly string[] = DEFAULT_NAMES;
  const first = result.steps[0]!;
  assert.match(annotateStep(first, result, names, null).headline, /发牌/);

  const bidStep = result.steps.find((step) => step.kind === 'bid')!;
  const bidNote = annotateStep(bidStep, result, names, result.state.deal?.trump ?? null);
  assert.match(bidNote.headline, /^(你|阿豪|小美) /);
  assert.match(bidNote.headline, /40|45|不叫/);

  const playSteps = result.steps.filter((step) => step.kind === 'play');
  assert.ok(playSteps.length > 10);
  let winners = 0;
  for (const step of playSteps) {
    const note = annotateStep(step, result, names, result.state.deal!.trump!);
    assert.ok(note.tags.length > 0, `第 ${step.index + 1} 步没有任何标签`);
    assert.match(note.headline, /领出|跟出/);
    if (note.tags.includes('赢墩')) winners += 1;
  }
  assert.ok(winners >= 1, '每一墩都该有一个赢墩，标签里一次都没出现说明判定错了');
  assert.equal(winners, result.tricks.length, '赢墩数量应等于墩数');

  const trick = result.tricks[0]!;
  const trickNote = annotateTrick(trick, names, result.state.deal!.trump!);
  assert.match(trickNote.headline, /领出 · .+ 赢墩$/);
  assert.ok(trickNote.tags.some((tag) => tag.startsWith('每家 ')));
});

test('cardsSummary：同一门合成一段，跨门分开；门内按引擎的层号排序', () => {
  const deck = new Map(fullDeck().map((card) => [cardKey(card), card]));
  const pick = (key: string) => deck.get(key)!;
  const trump = { strain: 'H', rank: 5 } as const;
  assert.equal(cardsSummary([pick('H3'), pick('H4'), pick('H6')], trump), '♥3-4-6');
  assert.equal(cardsSummary([pick('C2'), pick('C3'), pick('D4')], trump), '♣2-3 ♦4');
  assert.equal(cardsSummary([pick('j1')], trump), '大王');
  assert.equal(cardsSummary([pick('j0'), pick('j1'), pick('C2')], trump), '小王 大王 ♣2');
  // 主级 ♥5 在层号上高于 ♥A，所以写成 ♥A-5 而不是 ♥5-A（cardKey 用数字层号：♥A = H14）
  assert.equal(cardsSummary([pick('H14'), pick('S5'), pick('H5')], trump), '♥A-5 ♠5');
  assert.equal(cardsSummary([pick('H3'), pick('H4'), pick('H6')], null), '♥3-4-6');
  assert.equal(cardsSummary([], trump), '—');
});

test('导出 → 导入 → 再导出：内容一致（时间戳除外）', () => {
  const { actions } = playOut(SPEC);
  const draft = createDraft(setupOf(), 'draft-1', nowIso());
  const withActions = { ...draft, actions };
  const built = buildStory(withActions);
  assert.deepEqual(built.errors, []);
  const story = built.story!;
  assert.equal(story.complete, true);
  assert.equal(storyFilename(story), 'test-deal.json');
  assert.equal(story.deal.hands.length, 3);
  assert.equal(story.deal.hands[0]!.length, 17);
  assert.equal(story.deal.kitty.length, 3);
  assert.equal(story.actions.length, actions.length);

  const parsed = parseStoryJson(storyToJson(story));
  assert.equal(parsed.ok, true, `导入失败：${parsed.ok ? '' : parsed.errors.join('；')}`);
  const back = parsed.ok ? parsed.story : null;
  assert.notEqual(back, null);
  const normalize = (value: DealStory): string =>
    JSON.stringify({ ...value, exportedAt: 'X' }, null, 2);
  assert.equal(normalize(back!), normalize(story));

  // 从导入的 JSON 接着编：草稿 → 再导出，牌面与说明都不变
  const redraft = draftFromStory(back!, 'draft-2', nowIso());
  const rebuilt = buildStory(redraft).story!;
  assert.equal(normalize(rebuilt), normalize(story));
  assert.deepEqual(
    rebuilt.actions.map((step) => step.note),
    story.actions.map((step) => step.note)
  );
});

test('导出的 JSON 里牌面与回放结果一致（改动动作就会对不上，正是想要的）', () => {
  const { actions } = playOut(SPEC);
  const draft = createDraft(setupOf(), 'draft-3', nowIso());
  const story = buildStory({ ...draft, actions }).story!;
  const replayed = replayStory(story.spec, story.actions);
  // 手牌与暗底存的是「刚发完牌」那一刻（打完之后各家手牌是空的）
  assert.deepEqual(
    replayed.dealtState!.deal!.hands.map((hand) => hand.map(cardKey)),
    story.deal.hands.map((hand) => [...hand])
  );
  assert.deepEqual(replayed.dealtState!.deal!.originalKitty.map(cardKey), [...story.deal.originalKitty]);
  assert.deepEqual(replayed.state.deal!.kitty.map(cardKey), [...story.deal.kitty]);
  assert.deepEqual(story.deal.trump, replayed.state.deal!.trump);
  assert.equal(story.deal.summary?.finalScore, replayed.state.deal!.summary?.finalScore);
  // 存下来的牌面只是存证，渲染不靠重算；把种子改坏也不该影响已导出的牌面
  assert.notDeepEqual(
    replayStory({ ...story.spec, seed: 'another' }, story.actions).dealtState?.deal?.hands.map((h) =>
      h.map(cardKey)
    ),
    story.deal.hands.map((hand) => [...hand])
  );
});

test('导入的坏数据逐条拒绝，并且指出是哪个字段', () => {
  const { actions } = playOut(SPEC);
  const story = buildStory({ ...createDraft(setupOf(), 'draft-4', nowIso()), actions }).story!;
  const mutate = (patch: Record<string, unknown>): string => JSON.stringify({ ...story, ...patch });
  const expectError = (text: string, keyword: string): void => {
    const parsed = parseStoryJson(text);
    assert.equal(parsed.ok, false, `这份数据本该被拒：${text.slice(0, 80)}`);
    if (!parsed.ok) {
      assert.ok(
        parsed.errors.some((error) => error.includes(keyword)),
        `报错里没有提到「${keyword}」：${parsed.errors.join('；')}`
      );
    }
  };

  expectError('{ not json', 'JSON');
  expectError('[]', '对象');
  expectError(mutate({ version: 2 }), 'version');
  expectError(mutate({ slug: 'Bad Slug' }), 'slug');
  expectError(mutate({ title: '  ' }), 'title');
  expectError(mutate({ names: ['只有两个', '名字'] }), 'names');
  expectError(mutate({ spec: { ...story.spec, dealerSeat: 9 } }), 'spec');
  expectError(mutate({ spec: { ...story.spec, levels: [{ rank: 1, cycle: 0 }] } }), 'spec');
  expectError(mutate({ actions: [{ type: 'play', seat: 0, cards: ['Z9'], note: null }] }), 'actions');
  expectError(mutate({ actions: [{ type: 'bid', seat: 0, call: { points: 43, strain: 'C' }, note: null }] }), 'actions');
  expectError(mutate({ trickNotes: 'x' }), 'trickNotes');
  expectError(mutate({ intro: 3 }), 'intro');
  expectError(mutate({ complete: 'yes' }), 'complete');
  expectError(mutate({ deal: null }), 'deal');
  expectError(mutate({ deal: { ...story.deal, hands: [['Z9'], [], []] } }), 'deal');

  // 正常数据必须过（否则上面的守卫就是在拒绝一切）
  assert.equal(parseStoryJson(storyToJson(story)).ok, true);
});

test('草稿设置：slug 推导与表单校验', () => {
  assert.equal(SLUG_PATTERN.test('test-deal'), true);
  assert.equal(SLUG_PATTERN.test('-bad'), false);
  assert.equal(SLUG_PATTERN.test('有中文'), false);
  assert.equal(defaultSlug('3271', ''), 'deal-3271');
  assert.equal(defaultSlug('A B', 'My Deal 1'), 'my-deal-1');
  assert.ok(SLUG_PATTERN.test(defaultSlug('!!!', '')));
  assert.deepEqual(validateSetup(setupOf()), []);
  assert.deepEqual(validateSetup(setupOf({ seed: ' ' })), ['种子不能为空']);
  assert.equal(validateSetup(setupOf({ slug: '中文' })).length, 1);
  assert.equal(validateSetup(setupOf({ names: ['你', '', '小美'] })).length, 1);
  assert.equal(
    validateSetup(setupOf({ levels: [{ rank: 99, cycle: 0 }, ...SPEC.levels.slice(1)] })).length,
    1
  );
});

test('新建草稿自带一条 deal 动作，重开页面就能看到牌面', () => {
  const draft = createDraft(setupOf(), 'draft-5', nowIso());
  assert.deepEqual(draft.actions, [{ type: 'deal', note: null }]);
  assert.deepEqual(draft.trickNotes, []);
  assert.equal(draft.intro, '');
  const result = replayStory(draft.spec, draft.actions);
  assert.equal(result.error, null);
  assert.equal(result.state.deal?.phase, 'auction');
  assert.equal(initialState(draft.spec).deal, null, '初始状态在发牌之前应当没有牌局');
});

test('默认名字与教程一致：文案里不出现方位称谓', () => {
  assert.deepEqual([...DEFAULT_NAMES], [...TUTORIAL_NAMES]);
  assert.equal(/[东南西]/.test(DEFAULT_NAMES.join('')), false);
  assert.deepEqual(
    SEATS.map((seat) => DEFAULT_NAMES[seat]),
    ['你', '阿豪', '小美']
  );
});

test('出手前先试回放：不合法就不写进动作序列', () => {
  const spec = testSpec('sixty-append');
  const opening: StoryAction[] = [{ type: 'deal' }];

  const good = tryAppend(spec, opening, { type: 'bid', seat: 0, call: { points: 40, strain: 'C' } });
  assert.equal(good.ok, true);
  assert.equal(good.message, null);
  assert.equal(good.steps.length, 2);

  const outOfTurn = tryAppend(spec, opening, { type: 'bid', seat: 1, call: { points: 40, strain: 'C' } });
  assert.equal(outOfTurn.ok, false);
  assert.match(outOfTurn.message ?? '', /第 2 步不合法/);
  assert.match(outOfTurn.message ?? '', /还没轮到你/);
  assert.deepEqual(outOfTurn.steps, opening, '不合法时不许动已有序列');

  const toBury: StoryAction[] = [
    { type: 'deal' },
    { type: 'bid', seat: 0, call: { points: 40, strain: 'C' } },
    { type: 'bid', seat: 1, call: 'pass' },
    { type: 'bid', seat: 2, call: 'pass' }
  ];
  const bury = tryAppend(spec, toBury, { type: 'bury', seat: 0, cards: binder(0, spec) });
  assert.equal(bury.ok, true);
  const state = replayStory(spec, bury.steps).state;
  const pair = findNonRunPair(state.deal!.hands[0]!, state.deal!.trump!);
  assert.notEqual(pair, null);

  const badLead = tryAppend(spec, bury.steps, { type: 'play', seat: 0, cards: pair!.map(cardKey) });
  assert.equal(badLead.ok, false);
  assert.match(badLead.message ?? '', /顺子|同门/);
  assert.equal(badLead.steps.length, bury.steps.length);

  const legal = pickLegalPlay(state, 0);
  assert.notEqual(legal, null);
  const goodPlay = tryAppend(spec, bury.steps, { type: 'play', seat: 0, cards: legal!.map(cardKey) });
  assert.equal(goodPlay.ok, true);
  assert.equal(goodPlay.steps.length, bury.steps.length + 1);
});

test('从某一步重打：动作与墩级说明一起截断，之后还能接着走完', () => {
  const { actions, result } = playOut(SPEC);
  const full = result.tricks.length;
  const cutIndex = Math.min(12, actions.length - 1);
  const cut = truncateActions(SPEC, actions, cutIndex);
  assert.equal(cut.steps.length, cutIndex);
  assert.equal(cut.trickCount, replayStory(SPEC, cut.steps).tricks.length, '保留前缀里的墩数要现算');
  assert.ok(cut.trickCount <= full);
  assert.equal(truncateActions(SPEC, actions, 0).steps.length, 0);
  assert.equal(truncateActions(SPEC, actions, actions.length + 5).steps.length, actions.length, '越界不该丢东西');

  const resumed = playOut(SPEC, { start: cut.steps });
  assert.equal(resumed.result.error, null, '重打之后应当还能一路走完');
  assert.equal(resumed.result.state.deal?.phase, 'scored');
  assert.ok(resumed.result.tricks.length >= 1);
});
