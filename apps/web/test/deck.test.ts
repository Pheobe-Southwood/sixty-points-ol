/**
 * 演示页结构的测试：章节、屏数、深链、以及概念章文案的禁忌与「一屏能一眼读完」。
 *
 * 牌局章的内容正确性由 `deal-story.test.ts` 负责（它盯着生成物与 JSON 的一致性）；
 * 这里只管**幻灯机本身的形状**：每一屏都能被定位、每一墩都恰好一屏、文案里没有禁忌词。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildDeck, chapterOf, slideIndexOf } from '../src/lib/tutorial/deck.ts';
import { STORIES } from '../src/lib/tutorial/stories/index.ts';

const deck = buildDeck(STORIES);

test('封面、概念章、三副牌局、收尾——章节连续且覆盖全部屏', () => {
  assert.equal(deck.slides[0]!.kind, 'cover');
  assert.equal(deck.slides[deck.slides.length - 1]!.kind, 'end');
  assert.deepEqual(
    deck.chapters.map((chapter) => chapter.id),
    ['cover', 'basics', ...STORIES.map((story) => `story-${story.slug}`), 'end']
  );

  // 章节必须无缝铺满：每一章的 first 就是上一章的末尾，合起来等于总屏数
  let cursor = 0;
  for (const chapter of deck.chapters) {
    assert.equal(chapter.first, cursor, `章节「${chapter.title}」的起点与上一章接不上`);
    assert.ok(chapter.count > 0, `章节「${chapter.title}」没有屏`);
    cursor += chapter.count;
  }
  assert.equal(cursor, deck.slides.length, '章节加起来不等于总屏数');

  const ids = deck.slides.map((slide) => slide.id);
  assert.equal(new Set(ids).size, ids.length, '屏 id 有重复，深链会指向错的地方');
});

/** 概念章必须讲到的词：改稿时最容易连词带句子一起删掉，所以用守卫钉住 */
const REQUIRED_KEYWORDS = ['级牌', '跳过级牌', '结构优先', '保底', '抠底', '不跳叫', '杀牌', '垫牌'] as const;

test('概念章 15 屏：屏数、挂件，以及「一屏能一眼读完」的文案守卫', () => {
  const known = new Set([
    'point-values',
    'point-places',
    'trump-groups',
    'trump-ladder',
    'side-suit',
    'trump-run-cross',
    'bid-demo',
    'bury-demo',
    'multiplier',
    'lead-cases',
    'follow-answer',
    'ruff-contrast',
    'settle-equation',
    'upgrade-table'
  ]);
  const basics = deck.chapters.find((chapter) => chapter.id === 'basics')!;
  assert.equal(basics.count, 15, '基本概念章应当是 15 屏');
  const slides = deck.slides.filter((slide) => slide.chapterId === 'basics');
  for (const slide of slides) {
    assert.ok(slide.title.trim().length > 0, `${slide.id} 缺标题`);
    assert.ok(slide.points.length >= 2, `${slide.id} 正文少于两条`);
    assert.ok(slide.points.length <= 3, `${slide.id} 正文有 ${slide.points.length} 条，一屏读不完`);
    for (const point of slide.points) {
      assert.ok(point.trim().length >= 10, `${slide.id} 有一条正文过短：${point}`);
      // 幻灯片不是文章：单条超过 80 字就该拆到挂件里或删掉（现有最长 71 字）
      assert.ok(point.length <= 80, `${slide.id} 有一条正文 ${point.length} 字，超过 80：${point}`);
      // 粗体只用来标「会看错的那个词」：必须成对，且一条最多一处
      const parts = point.split('**').length;
      assert.equal(parts % 2, 1, `${slide.id} 的粗体标记不成对：${point}`);
      assert.ok(parts <= 3, `${slide.id} 同一条正文里有多处粗体，重点会互相抵消：${point}`);
    }
    const bold = slide.points.reduce((sum, point) => sum + (point.split('**').length - 1) / 2, 0);
    assert.ok(bold <= 2, `${slide.id} 一屏有 ${bold} 处粗体，满屏重点等于没有重点`);
    if (slide.widget !== undefined) {
      assert.ok(known.has(slide.widget.kind), `${slide.id} 的挂件类型未知：${slide.widget.kind}`);
    }
  }
  // 关键几条概念必须讲到（否则演示页就不完整）
  const texts = slides.flatMap((slide) => [slide.title, ...slide.points]).join('\n');
  for (const keyword of REQUIRED_KEYWORDS) {
    assert.ok(texts.includes(keyword), `概念章没有讲到「${keyword}」`);
  }
  // 每个实现了的挂件都得有屏在用：`point-places` 曾经是「类型里有、组件里实现了、没人用」的死代码
  const used = new Set(slides.map((slide) => slide.widget?.kind));
  assert.ok(used.has('point-places'), '概念章没有任何一屏使用 point-places 挂件（它又变成死代码了）');
});

test('每副牌局：发牌一屏、叫牌按 4 手分屏、每墩恰好一屏、结算与收尾各一屏', () => {
  for (const story of STORIES) {
    const chapter = deck.chapters.find((item) => item.id === `story-${story.slug}`)!;
    const slides = deck.slides.filter((slide) => slide.chapterId === chapter.id);
    const bids = story.lines.filter((line) => line.kind === 'bid').length;
    const expected = 1 + 1 + Math.ceil(bids / 4) + 1 + story.tricks.length + 1 + 1;
    assert.equal(chapter.count, expected, `${story.slug} 的屏数不对：${slides.length}`);
    assert.equal(chapter.title, story.title);

    // 每墩恰好一屏，且按顺序
    const trickSlides = slides.filter((slide) => slide.kind === 'story-trick');
    assert.equal(trickSlides.length, story.tricks.length, `${story.slug} 的墩屏数不等于墩数`);
    trickSlides.forEach((slide, index) => {
      assert.equal(slide.trickOrdinal, index, `${story.slug} 第 ${index + 1} 墩屏的序号对不上`);
      const trick = story.tricks[slide.trickOrdinal!]!;
      assert.equal(slide.lineIndexes?.length, 3, `${story.slug} 第 ${index + 1} 墩没有挂上三条说明`);
      // 屏幕上的三条说明必须正好是这一墩的三手牌
      assert.deepEqual(
        [...(slide.lineIndexes ?? [])].sort((a, b) => a - b),
        trick.plays.map((play) => story.lines.find((line) => line.cards.join() === play.cards.join())?.index ?? -1).sort((a, b) => a - b),
        `${story.slug} 第 ${index + 1} 墩挂错了说明`
      );
      void trick;
    });

    // 叫牌屏：合起来正好覆盖所有叫品，且不重复
    const bidIndexes = slides
      .filter((slide) => slide.kind === 'story-bid')
      .flatMap((slide) => slide.lineIndexes ?? []);
    assert.equal(bidIndexes.length, bids, `${story.slug} 叫牌屏漏了叫品`);
    assert.equal(new Set(bidIndexes).size, bids, `${story.slug} 同一手叫牌出现在两屏里`);

    // 每屏引用的说明下标都必须真实存在
    for (const slide of slides) {
      for (const index of slide.lineIndexes ?? []) {
        assert.ok(story.lines[index] !== undefined, `${slide.id} 引用了不存在的说明 #${index}`);
        assert.equal(story.lines[index]!.index, index);
      }
    }
  }
});

test('深链：每屏都能用自己的 id 定位回来', () => {
  for (const slide of deck.slides) {
    assert.equal(slideIndexOf(deck, slide.id), deck.slides.indexOf(slide), `深链 #${slide.id} 定位错了`);
    assert.equal(chapterOf(deck, slide.id)?.id, slide.chapterId);
  }
  assert.equal(slideIndexOf(deck, '不存在的屏'), -1);
  // 牌局章用 id 就能跳到具体某一墩（分享链接靠这个）
  assert.ok(slideIndexOf(deck, '245-trick-8') >= 0);
  assert.ok(slideIndexOf(deck, '222-settle') >= 0);
  assert.ok(slideIndexOf(deck, 'deal-zhs7sx-trick-1') >= 0);
});

test('文案禁忌：概念章里没有方位称谓、没有裸花色字母', () => {
  for (const slide of deck.slides) {
    const text = [slide.title, ...slide.points].join('\n');
    assert.equal(/[东南西]/.test(text), false, `${slide.id} 出现方位称谓：${text.slice(0, 40)}`);
    assert.equal(
      /\d{2,3}\s?[CDHS]\b/.test(text),
      false,
      `${slide.id} 的叫品出现裸花色字母（应写成 40♣）：${text.slice(0, 40)}`
    );
  }
});

test('依赖级牌的示例都自带「本副：」环境说明（沿用 /rules 的那条规矩）', () => {
  const widget = readFileSync(new URL('../src/lib/components/deck/DeckWidget.svelte', import.meta.url), 'utf8');
  const trick = readFileSync(new URL('../src/lib/components/deck/StoryTrick.svelte', import.meta.url), 'utf8');
  assert.ok(widget.includes('本副：') && widget.includes('trumpText('), '概念章的挂件没有渲染将牌环境');
  // 牌局章每一墩屏都在页头写「级牌 X · 主打 Y」，且每张牌面的主牌金边走的是引擎判定
  const page = readFileSync(new URL('../src/routes/learn/+page.svelte', import.meta.url), 'utf8');
  assert.ok(page.includes('role="group"') && page.includes('aria-roledescription="幻灯片"'), '演示页缺幻灯片语义');
  assert.ok(page.includes('aria-label={playing') || page.includes("aria-label={playing ? '暂停自动播放'"), '自动播放按钮缺 aria-label');
  assert.ok(trick.includes('handFromKeys'), '牌局章没有走 handFromKeys 还原牌面');
});

test('幻灯机：自动播放、深链、键盘都接上了（源码级守卫）', () => {
  const page = readFileSync(new URL('../src/routes/learn/+page.svelte', import.meta.url), 'utf8');
  assert.ok(page.includes('setTimeout'), '没有自动播放的计时器');
  assert.ok(page.includes('history.replaceState'), '翻页没有同步地址（深链会失效）');
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Escape']) {
    assert.ok(page.includes(`'${key}'`), `键盘少接了 ${key}`);
  }
  assert.ok(page.includes('prefers-reduced-motion'), '没有尊重「减少动态效果」的系统设置');
  assert.ok(page.includes('visibilitychange'), '切到后台没有暂停');
  const load = readFileSync(new URL('../src/routes/learn/+page.ts', import.meta.url), 'utf8');
  assert.ok(load.includes("searchParams.get('s')"), '?s= 深链没有实现');
});
