/**
 * 牌局故事的完整性测试：作者的 JSON ↔ 生成物 ↔ 页面要用的数据。
 *
 * 这一层是「演示页上的牌面与讲解不会悄悄变味」的总闸：
 * - 生成物必须等于**现场重算**的结果（手改生成物、或改完 JSON/notes 忘了重跑，都会红）；
 * - 作者的原话必须**逐字**还在；
 * - 润色条目记的原文必须与 JSON 里的原话一致（防漂移）；
 * - 该有说明的步（出牌、埋底、非「不叫」的叫品、发牌）一条都不能缺，每墩都要有小结；
 * - 文案不许出现方位称谓，叫品不许出现裸花色字母。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { convertStory } from '../src/lib/story/convert.ts';
import { emitStoriesIndex, emitStoryModule } from '../src/lib/story/emit.ts';
import { parseNotesOverlay } from '../src/lib/story/notes.ts';
import { parseStoryJson } from '../src/lib/story/export.ts';
import type { StoryDealData } from '../src/lib/story/story-data.ts';
import { STORIES } from '../src/lib/tutorial/stories/index.ts';

const SLUGS = ['245', '222', 'deal-zhs7sx'] as const;

function read(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

function converted(slug: string): StoryDealData {
  const story = parseStoryJson(read(`docs/deals/${slug}.json`));
  assert.equal(story.ok, true, `${slug} 的牌局 JSON 结构不合法`);
  if (!story.ok) throw new Error('unreachable');
  const overlay = parseNotesOverlay(JSON.parse(read(`docs/deals/notes/${slug}.json`)), slug);
  assert.equal(typeof overlay, 'object', `${slug} 的 notes 覆盖层不合法：${String(overlay)}`);
  if (typeof overlay === 'string') throw new Error('unreachable');
  const result = convertStory(story.story, overlay);
  assert.deepEqual(result.problems, [], `${slug} 转换有问题：\n${result.problems.join('\n')}`);
  assert.notEqual(result.data, null);
  return result.data!;
}

test('三副故事都能转换，且没有任何质检问题', () => {
  for (const slug of SLUGS) {
    const data = converted(slug);
    assert.equal(data.slug, slug);
    assert.ok(data.intro.trim().length > 0, `${slug} 缺开篇`);
    assert.ok(data.outro.trim().length > 0, `${slug} 缺收尾`);
    assert.equal(data.tricks.length, 8, `${slug} 应当是 8 墩`);
  }
});

test('生成物与现场重算逐字节一致（手改生成物、或忘了重跑，都会红）', () => {
  for (const slug of SLUGS) {
    const expected = emitStoryModule(converted(slug));
    const committed = read(`apps/web/src/lib/tutorial/stories/${slug}.ts`);
    assert.equal(
      committed,
      expected,
      `${slug}.ts 与现场重算不一致：改讲解请改 docs/deals 下的源文件，再跑 pnpm --filter web deal`
    );
  }
  const indexExpected = emitStoriesIndex([...SLUGS]);
  assert.equal(read('apps/web/src/lib/tutorial/stories/index.ts'), indexExpected, 'stories/index.ts 需要重跑生成');
});

test('页面导入的 STORIES 就是这三副，顺序与生成物一致', () => {
  assert.deepEqual(
    STORIES.map((story) => story.slug),
    [...SLUGS],
    '演示页拿到的故事顺序不对（应当先早局、后后期局）'
  );
  for (const story of STORIES) {
    const fresh = converted(story.slug);
    assert.deepEqual(story, fresh, `${story.slug} 的生成物与现场重算在语义上不一致`);
    assert.equal(story.tricks.length, 8);
    assert.equal(
      story.tricks.reduce((sum, trick) => sum + trick.size, 0),
      17,
      `${story.slug} 的墩张数加起来不是 17 个牌位`
    );
  }
});

test('作者原话逐字保留，润色条目不许漂移', () => {
  for (const slug of SLUGS) {
    const parsed = parseStoryJson(read(`docs/deals/${slug}.json`));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) continue;
    const data = converted(slug);

    for (const line of data.lines) {
      const authorNote: string | null = parsed.story.actions[line.index]?.note ?? null;
      if (line.source === 'author') {
        assert.equal(line.text, authorNote, `${slug} 第 ${line.index + 1} 步的原话被改写了`);
        assert.equal(line.original, null);
      }
      if (line.source === 'polish') {
        assert.notEqual(line.original, null, `${slug} 第 ${line.index + 1} 步的润色条目没有记原文`);
        assert.equal(
          line.original,
          authorNote,
          `${slug} 第 ${line.index + 1} 步：润色条目记的原文与牌局里的原话对不上`
        );
        assert.notEqual(line.text, authorNote, `${slug} 第 ${line.index + 1} 步标了润色却与原话一字不差`);
      }
      if (line.source === 'fill') {
        assert.ok(line.text !== null && line.text.trim().length > 0);
      }
    }
  }
});

test('每一步都有交代：出牌/埋底/非「不叫」的叫品一条不缺，留空的只有「不叫」', () => {
  for (const slug of SLUGS) {
    const data = converted(slug);
    const blank = data.lines.filter((line) => line.text === null);
    for (const line of blank) {
      assert.equal(line.kind, 'bid', `${slug} 第 ${line.index + 1} 步（${line.kind}）没有说明`);
      assert.match(line.headline, /不叫$/, `${slug} 第 ${line.index + 1} 步留空了却不是「不叫」：${line.headline}`);
    }
    assert.equal(
      data.counts.author + data.counts.polish + data.counts.fill + data.counts.blank,
      data.counts.total,
      `${slug} 的来源统计不闭合`
    );
    assert.equal(data.counts.total, data.lines.length);
    // 每一墩：三家三手牌、一条小结，且说明挂在这一墩上
    for (const trick of data.tricks) {
      assert.equal(trick.plays.length, 3, `${slug} 第 ${trick.ordinal + 1} 墩不是三家各一手`);
      assert.equal(trick.lines.length, 3, `${slug} 第 ${trick.ordinal + 1} 墩没有挂上三条说明`);
      assert.ok((trick.note ?? '').trim().length > 0, `${slug} 第 ${trick.ordinal + 1} 墩缺小结`);
      assert.match(trick.headline, /领出 · .+ 赢墩$/);
    }
  }
});

test('文案禁忌：没有方位称谓，叫品没有裸花色字母，牌面记号不谎称顺子', () => {
  for (const slug of SLUGS) {
    const data = converted(slug);
    for (const line of data.lines) {
      const text = `${line.headline}｜${line.text ?? ''}`;
      assert.equal(/[东南西]/.test(text), false, `${slug} 第 ${line.index + 1} 步出现方位称谓：${text}`);
      assert.equal(
        /\d{2,3}\s?[CDHS]\b/.test(line.headline),
        false,
        `${slug} 第 ${line.index + 1} 步的叫品出现裸花色字母：${line.headline}`
      );
    }
    for (const trick of data.tricks) {
      assert.equal(/[东南西]/.test(trick.note ?? ''), false, `${slug} 第 ${trick.ordinal + 1} 墩小结出现方位称谓`);
    }
    assert.equal(/[东南西]/.test(`${data.intro}${data.outro}`), false, `${slug} 开篇/收尾出现方位称谓`);
  }
});

test('存证与回放一致：手牌、暗底、埋回、将牌、定约、结算都对得上', () => {
  for (const slug of SLUGS) {
    const parsed = parseStoryJson(read(`docs/deals/${slug}.json`));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) continue;
    const data = converted(slug);
    assert.deepEqual(data.deal.hands, parsed.story.deal.hands, `${slug} 的手牌存证与生成物不一致`);
    assert.deepEqual(data.deal.originalKitty, parsed.story.deal.originalKitty);
    assert.deepEqual(data.deal.kitty, parsed.story.deal.kitty);
    assert.deepEqual(data.deal.summary, parsed.story.deal.summary);
    assert.equal(data.deal.hands.length, 3);
    for (const hand of data.deal.hands) assert.equal(hand.length, 17, `${slug} 发牌时每家应当 17 张`);
    // 庄家拿上来的底牌 = 发牌时的 17 张 + 3 张暗底（20 张不重不漏）；
    // 埋回去的 3 张必须出自这 20 张（可以是原先手里的，也可以是刚拿上来的那 3 张）
    const declarer = data.deal.contract!.declarerSeat;
    const pool = [...data.deal.hands[declarer]!, ...data.deal.originalKitty];
    assert.equal(new Set(pool).size, 20, `${slug} 庄家的 17 张加暗底 3 张应当是 20 张不同的牌`);
    for (const key of data.deal.kitty) {
      assert.ok(pool.includes(key), `${slug} 埋回去的 ${key} 不在庄家手里（既不在发牌的 17 张里，也不是暗底）`);
    }
    assert.equal(data.deal.kitty.length, 3);
  }
});

test('三副的看点各不相同（不是三份同型牌局）', () => {
  const summaries = SLUGS.map((slug) => converted(slug).deal.summary!);
  assert.equal(summaries[0]!.made, false, '245 应当是打输');
  assert.equal(summaries[1]!.made, false, '222 应当是打输');
  assert.equal(summaries[2]!.made, true, 'zhs7sx 应当是打成');
  assert.equal(summaries[0]!.protectedBottom, false);
  assert.equal(summaries[1]!.protectedBottom, false);
  assert.equal(summaries[2]!.protectedBottom, true);
  // 两副被抠底、一副保底；且一副是「底牌 0 分」这种特殊情况
  assert.equal(summaries[2]!.kittyPoints, 0, 'zhs7sx 的底牌应当是 0 分（不埋分，末轮没有额外好处）');
  assert.ok(summaries[0]!.kittyPoints > 0 && summaries[1]!.kittyPoints > 0);
  // 三副的级牌/主各不同，覆盖早局与后期局
  const trumps = SLUGS.map((slug) => {
    const trump = converted(slug).deal.trump!;
    return `${trump.strain}${trump.rank}`;
  });
  assert.equal(new Set(trumps).size, 3, `三副的将牌环境应当各不相同，实际 ${trumps.join(' / ')}`);
});
