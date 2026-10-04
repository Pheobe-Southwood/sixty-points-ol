/**
 * 说明标签的单测：牌面记法与「杀牌」判定。
 *
 * 这一层守的是**教程最要紧的两件事**，两处都曾经真错过：
 * 1. `cardsSummary` 把「同门不相邻」印成 `♣6-10`（看着像顺子，段分解却是 `[1,1]`）；
 * 2. 只要主牌跟副牌领出就标「杀牌（n 张主牌相连）」，而三张副级完全相等时根本杀不了。
 *
 * 除了逐条钉住规则的用例，还有一条**对着三副真实牌面的性质断言**：
 * 每个用 `-` 连起来的记号，都必须真的是一条顺子 —— 且记号数量与段数量一致。
 * 段数量在测试里用引擎原语独立算一遍（不调被测函数），否则就是自己测自己。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  cardClass,
  cardKey,
  cardLevel,
  fullDeck,
  segments,
  type Card,
  type TrumpModel
} from '@sixty/engine';

import { annotateStep, cardsSummary, type StepAnnotation } from '../src/lib/story/annotate.ts';
import { parseStoryJson } from '../src/lib/story/export.ts';
import { replayStory } from '../src/lib/story/replay.ts';
import { handOf } from '../src/lib/tutorial/scenarios.ts';

const TRUMP_H5: TrumpModel = { strain: 'H', rank: 5 };
const TRUMP_H4: TrumpModel = { strain: 'H', rank: 4 };
const TRUMP_S2: TrumpModel = { strain: 'S', rank: 2 };
const TRUMP_S10: TrumpModel = { strain: 'S', rank: 10 };

test('cardsSummary：只有真的相邻才用 - 连起来', () => {
  // 级牌 5 被跳过后 ♥3 ♥4 ♥6 相邻（这是 /rules 里那个例子）
  assert.equal(cardsSummary(handOf('H3', 'H4', 'H6'), TRUMP_H5), '♥3-4-6');
  // ♣2 ♣3 相邻，♣6 与它们差着 —— 各自成记号，绝不写成 ♣2-3-6
  assert.equal(cardsSummary(handOf('C2', 'C3', 'C6'), TRUMP_H5), '♣2-3 ♣6');
  // 245 步20 的原样：两个门各是两个单张，引擎段分解是 [1,1] / [1,1] 而不是长顺。
  // 段内按层号升序（与作者写法一致：♠K-A、♣J-Q-K-A 都是升序）
  assert.equal(cardsSummary(handOf('C10', 'C6', 'D9', 'D2'), TRUMP_H4), '♣6 ♣10 ♦2 ♦9');
  assert.deepEqual(
    segments(handOf('C10', 'C6').filter((c) => 'suit' in c), TRUMP_H4),
    [1, 1]
  );
  // 222 步39：♥4 与 ♥8 中间隔着 ♥5 ♥6 ♥7（副牌跳过级牌 2 后的层号是 2 与 6）
  assert.equal(cardsSummary(handOf('H4', 'H8'), TRUMP_S2), '♥4 ♥8');
  // 245 步21：真正的三顺 + 一张散的
  assert.equal(cardsSummary(handOf('C2', 'C3', 'C5', 'C7'), TRUMP_H4), '♣2-3-5 ♣7');
});

test('cardsSummary：主牌跨花色成顺时逐张写出，三张副级永远分开', () => {
  // 主花色 → 副级 → 主级 是相邻的（级牌 5）：
  assert.equal(cardsSummary(handOf('H14', 'S5', 'H5'), TRUMP_H5), '♥A-♠5-♥5');
  assert.deepEqual(
    handOf('H14', 'S5', 'H5').map((c) => cardLevel(c, TRUMP_H5)),
    [12, 13, 14]
  );
  // 三张副级层号完全相等 ⇒ 三个记号，不是一个「三连」
  assert.equal(cardsSummary(handOf('S5', 'D5', 'C5'), TRUMP_H5), '♠5 ♦5 ♣5');
  assert.deepEqual(segments(handOf('S5', 'D5', 'C5'), TRUMP_H5), [1, 1, 1]);
  // 222 步24 的记号正好就是作者写的「♠A-♥2」：♠7 是另一段
  assert.equal(cardsSummary(handOf('H2', 'S14', 'S7'), TRUMP_S2), '♠7 ♠A-♥2');
  // 王参与主牌顺子（作者原话里的「小王-大王顺子」）
  assert.equal(cardsSummary(handOf('j0', 'j1', 'C2'), TRUMP_H5), '小王-大王 ♣2');
  // 245 步25：主级 ♥4 与副级 ♦4 相邻，是一条两顺
  assert.equal(cardsSummary(handOf('H4', 'D4'), TRUMP_H4), '♦4-♥4');
});

test('cardsSummary：没有将牌信息、空牌、王都兜得住', () => {
  assert.equal(cardsSummary([], TRUMP_H5), '—');
  assert.equal(cardsSummary(handOf('j1'), TRUMP_H5), '大王');
  assert.equal(cardsSummary(handOf('j0', 'j1'), TRUMP_H5), '小王-大王');
  // 将牌未知时只能按点数算：♥3 ♥4 相邻，♥6 与它们之间隔着未知的 ♥5，所以断开
  // （保守的一边：宁可少连，也不能凭空把两张牌说成一条顺子）
  assert.equal(cardsSummary(handOf('H3', 'H4', 'H6'), null), '♥3-4 ♥6');
  assert.equal(cardsSummary(handOf('C2', 'C6'), null), '♣2 ♣6');
  assert.equal(cardsSummary(handOf('S9', 'H3'), null), '♠9 ♥3');
});

test('cardsSummary：三副真实牌面的每一步都对得上引擎的段分解', () => {
  const files = ['245.json', '222.json', 'deal-zhs7sx.json'];
  let checked = 0;

  /** 独立算一遍「段」：按门分组 → 按层号排序 → 层号严格 +1 才算同段 */
  const runsOf = (cards: readonly Card[], trump: TrumpModel): number[] => {
    const groups = new Map<string, Card[]>();
    for (const card of cards) {
      const cls = cardClass(card, trump);
      const list = groups.get(cls);
      if (list === undefined) groups.set(cls, [card]);
      else list.push(card);
    }
    const lengths: number[] = [];
    for (const list of groups.values()) {
      const sorted = [...list].sort((a, b) => cardLevel(a, trump) - cardLevel(b, trump));
      let size = 0;
      for (let i = 0; i < sorted.length; i += 1) {
        if (i === 0 || cardLevel(sorted[i]!, trump) !== cardLevel(sorted[i - 1]!, trump) + 1) {
          if (i > 0) lengths.push(size);
          size = 1;
        } else {
          size += 1;
        }
      }
      if (sorted.length > 0) lengths.push(size);
    }
    return lengths.sort((a, b) => a - b);
  };

  for (const file of files) {
    const story = parseStoryJson(readFileSync(new URL(`../../../docs/deals/${file}`, import.meta.url), 'utf8'));
    assert.equal(story.ok, true, `${file} 结构校验失败`);
    if (!story.ok) continue;
    const result = replayStory(story.story.spec, story.story.actions);
    assert.equal(result.error, null, `${file} 回放失败`);
    const trump = result.state.deal!.trump!;

    for (const step of result.steps) {
      if (step.kind !== 'play') continue;
      checked += 1;
      const summary = cardsSummary(step.cards, trump);
      const tokens = summary.split(' ');
      const expected = runsOf(step.cards, trump);
      const actual = tokens.map((token) => token.split('-').length).sort((a, b) => a - b);
      assert.deepEqual(
        actual,
        expected,
        `${file} 步${step.index + 1}：${summary} 的记号张数 ${JSON.stringify(actual)} 与引擎段分解 ${JSON.stringify(expected)} 不一致`
      );
      assert.equal(
        actual.reduce((sum, n) => sum + n, 0),
        step.cards.length,
        `${file} 步${step.index + 1}：${summary} 漏了牌或重复了牌`
      );
    }
  }

  assert.ok(checked > 50, `只检查到 ${checked} 手牌，三副牌应该远不止这些`);
});

test('杀牌：必须是真的一条连续主牌，副级相等不算', () => {
  const load = (file: string) => {
    const story = parseStoryJson(readFileSync(new URL(`../../../docs/deals/${file}`, import.meta.url), 'utf8'));
    assert.equal(story.ok, true);
    if (!story.ok) throw new Error('unreachable');
    const result = replayStory(story.story.spec, story.story.actions);
    return { story: story.story, result, trump: result.state.deal!.trump! };
  };

  // 222 的末轮：♦2 ♣2 是两张副级（层号 13/13），段分解 1+1 —— 杀不了，标杀牌就是教错
  {
    const { story, result, trump } = load('222.json');
    const step = result.steps.find((item) => item.index === 45)!;
    assert.deepEqual(step.cards.map(cardKey), ['D2', 'C2']);
    assert.deepEqual(step.cards.map((card) => cardLevel(card, trump)), [13, 13]);
    assert.deepEqual(segments(step.cards, trump), [1, 1]);
    const annotation = annotateStep(step, result, story.names, trump);
    assert.equal(annotation.tags.includes('杀牌（2 张主牌相连）'), false, '副级相等被标成了杀牌');
    assert.ok(
      annotation.tags.some((tag) => tag.includes('不成顺') && tag.includes('1+1')),
      `末轮那手牌应标「不成顺」，实际标签：${annotation.tags.join(' / ')}`
    );
    assert.ok(annotation.tags.includes('此轮不赢'));
  }

  // 真杀牌必须仍然叫杀牌：222 步37 的 ♠3-4 杀掉 ♥5-6 领出
  {
    const { story, result, trump } = load('222.json');
    const step = result.steps.find((item) => item.index === 36)!;
    const annotation = annotateStep(step, result, story.names, trump);
    assert.equal(annotation.tags.includes('赢墩'), true);
    assert.ok(
      annotation.tags.includes('杀牌（2 张主牌相连）'),
      `♠3-4 是真杀牌，实际标签：${annotation.tags.join(' / ')}`
    );
  }

  // 全部三副：凡是标了「杀牌」的，都必须真的是一条连续主牌；反之标了「不成顺」的绝不能赢
  for (const file of ['245.json', '222.json', 'deal-zhs7sx.json']) {
    const { story, result, trump } = load(file);
    for (const step of result.steps) {
      if (step.kind !== 'play') continue;
      const annotation = annotateStep(step, result, story.names, trump);
      const claimsRuff = annotation.tags.some((tag) => tag.startsWith('杀牌'));
      const claimsBroken = annotation.tags.some((tag) => tag.startsWith('主牌跟牌不成顺'));
      if (claimsRuff) {
        assert.equal(
          segments(step.cards, trump).length,
          1,
          `${file} 步${step.index + 1} 标了杀牌，却不是一条连续主牌：${cardsSummary(step.cards, trump)}`
        );
      }
      if (claimsBroken) {
        assert.equal(
          annotation.tags.includes('赢墩'),
          false,
          `${file} 步${step.index + 1} 标了「不成顺」却写着赢墩`
        );
      }
    }
  }
});

test('叫品说明走 bidText（界面不许再拼引擎 bidLabel）', () => {
  const story = parseStoryJson(readFileSync(new URL('../../../docs/deals/deal-zhs7sx.json', import.meta.url), 'utf8'));
  assert.equal(story.ok, true);
  if (!story.ok) throw new Error('unreachable');
  const result = replayStory(story.story.spec, story.story.actions);
  const bidStep = result.steps.find((step) => step.kind === 'bid')!;
  const annotation = annotateStep(bidStep, result, story.story.names, null);
  assert.equal(annotation.headline, '阿豪 50♠');
  assert.equal(/\d+\s+[CDHS]\b/.test(annotation.headline), false, '叫品里出现了裸花色字母');
  // 三副里所有叫品行都不许出现裸花色字母
  for (const file of ['245.json', '222.json', 'deal-zhs7sx.json']) {
    const parsed = parseStoryJson(readFileSync(new URL(`../../../docs/deals/${file}`, import.meta.url), 'utf8'));
    if (!parsed.ok) continue;
    const replay = replayStory(parsed.story.spec, parsed.story.actions);
    for (const step of replay.steps) {
      if (step.kind !== 'bid') continue;
      const annotation: StepAnnotation = annotateStep(step, replay, parsed.story.names, null);
      assert.equal(
        /\d{2,3}\s?[CDHS]\b/.test(annotation.headline),
        false,
        `${file} 步${step.index + 1}：${annotation.headline}`
      );
    }
  }
});

test('发牌与埋底：张数与分值由引擎口径给出', () => {
  const story = parseStoryJson(readFileSync(new URL('../../../docs/deals/245.json', import.meta.url), 'utf8'));
  assert.equal(story.ok, true);
  if (!story.ok) throw new Error('unreachable');
  const result = replayStory(story.story.spec, story.story.actions);
  const dealStep = result.steps[0]!;
  assert.match(annotateStep(dealStep, result, story.story.names, null).headline, /每家 17 张，另留 3 张暗底/);

  const buryStep = result.steps.find((step) => step.kind === 'bury')!;
  const bury = annotateStep(buryStep, result, story.story.names, result.state.deal!.trump);
  assert.equal(bury.points, 10);
  assert.match(bury.headline, /埋 3 张（底分 10）/);
  assert.equal(fullDeck().length, 54);
});
