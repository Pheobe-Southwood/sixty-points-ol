/**
 * 生成物的文本：演示页用的数据模块，以及给作者复核的 review 清单。
 *
 * 都是纯函数（给定输入 → 给定字符串），所以测试可以把「仓库里的生成物」与「现场重算的结果」
 * 逐字节比一遍：谁手改了生成物、或改了牌局 JSON 却忘了重跑，CI 立刻红。
 */
import type { NotesOverlay } from './notes.ts';
import { SOURCE_LABEL, type StoryDealData } from './story-data.ts';
import type { StoryStep } from './types.ts';

const GENERATED_HEADER = `/**
 * 由 apps/web/scripts/build-deal-stories.ts 生成，请勿手改。
 *
 * 源文件：
 *   docs/deals/<slug>.json         作者打出来的牌局与逐步原话（永不改写）
 *   docs/deals/notes/<slug>.json   润色与补写（含 original / why，供复核）
 * 改讲解请改这两份，再重跑：pnpm --filter web deal
 */`;

export function emitStoryModule(data: StoryDealData): string {
  return `${GENERATED_HEADER}
import type { StoryDealData } from '$lib/story/story-data';

export const STORY: StoryDealData = ${JSON.stringify(data, null, 2)};
`;
}

export function emitStoriesIndex(slugs: readonly string[]): string {
  // 相对导入必须带 .ts 后缀：Vite 能省，但 node --test 直接跑 TS 时省不了
  // （生成物会被 test/deal-story.test.ts 真import，所以这里不能只照顾打包器）。
  const imports = slugs
    .map((slug, index) => `import { STORY as STORY_${index} } from './${slug}.ts';`)
    .join('\n');
  const list = slugs.map((_, index) => `  STORY_${index}`).join(',\n');
  return `${GENERATED_HEADER}
import type { StoryDealData } from '$lib/story/story-data';
${imports}

/** 演示页里的牌局故事；顺序即页面上的顺序（先早局、后后期局） */
export const STORIES: readonly StoryDealData[] = [
${list}
];
`;
}

export function storyModulePath(slug: string): string {
  return `src/lib/tutorial/stories/${slug}.ts`;
}

export function storiesIndexPath(): string {
  return 'src/lib/tutorial/stories/index.ts';
}

/** 给作者复核的清单：逐条「原文 → 现在 → 为什么」 */
export function emitReview(
  data: StoryDealData,
  actions: readonly StoryStep[],
  overlay: NotesOverlay,
  authorIntro: boolean,
  authorOutro: boolean
): string {
  const lines: string[] = [];
  const authorOf = (index: number): string => actions[index]?.note?.trim() ?? '（原话为空）';
  const stepOf = (index: number): string => `${index + 1}`;

  lines.push(`# ${data.title}（${data.slug}）· 讲解复核`);
  lines.push('');
  lines.push('这份清单是我改动你原话的**全部**记录。你的原话逐字保存在 `docs/deals/<slug>.json` 里，从未被改写；');
  lines.push('润色与补写都放在 `docs/deals/notes/<slug>.json`，删掉哪条、改成什么，说一声就改。');
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push(`- 动作 ${data.counts.total} 步 · ${data.tricks.length} 墩 · 作者原话 ${data.counts.author} 条 · 润色/改写 ${data.counts.polish} 条 · 补写 ${data.counts.fill} 条 · 留空 ${data.counts.blank} 条`);
  const summary = data.deal.summary;
  if (summary !== null) {
    lines.push(
      `- 定约 ${summary.contract.points}（庄 ${data.names[summary.contract.declarerSeat]}）· 庄家墩分 ${summary.declarerTrickPoints} · 底牌 ${summary.kittyPoints}×${summary.multiplier}${summary.protectedBottom ? '（保底）' : '（抠底）'} · 最终 ${summary.finalScore} · ${summary.made ? '打成' : '打输'}`
    );
  }
  lines.push('');

  const polished = data.lines.filter((line): line is typeof line & { original: string; why: string | null } => line.source === 'polish');
  lines.push('## 我改过原话的地方（润色 / 改写）');
  lines.push('');
  if (polished.length === 0) {
    lines.push('（没有）');
  } else {
    for (const line of polished) {
      lines.push(`### 第 ${stepOf(line.index)} 步 · ${line.headline}`);
      lines.push('');
      lines.push(`- 你的原话：${line.original}`);
      lines.push(`- 现在的说法：${line.text ?? ''}`);
      if (line.why !== null) lines.push(`- 为什么：${line.why}`);
      lines.push('');
    }
  }

  const filled = data.lines.filter((line) => line.source === 'fill');
  lines.push('## 我补写的地方（原本没写说明）');
  lines.push('');
  if (filled.length === 0) {
    lines.push('（没有）');
  } else {
    lines.push('| 步 | 这一手是什么 | 我写的话 |');
    lines.push('| --- | --- | --- |');
    for (const line of filled) {
      const tags = line.tags.length > 0 ? `<br><small>${line.tags.join(' · ')}</small>` : '';
      lines.push(`| ${stepOf(line.index)} | ${line.headline}${tags} | ${line.text ?? ''} |`);
    }
    lines.push('');
  }

  const blank = data.lines.filter((line) => line.text === null);
  lines.push('## 有意留空的步');
  lines.push('');
  if (blank.length === 0) {
    lines.push('（没有）');
  } else {
    lines.push('这些是「不叫」之类的机械步，写一句反而是废话；想补就在 notes 里加一条 `fill`。');
    lines.push('');
    for (const line of blank) lines.push(`- 第 ${stepOf(line.index)} 步 · ${line.headline}`);
    lines.push('');
  }

  const trickNotes = data.tricks.map((trick) => trick.note ?? '');
  lines.push('## 墩级小结（每墩一条）');
  lines.push('');
  for (const [index, note] of trickNotes.entries()) {
    const trick = data.tricks[index]!;
    const fromOverlay = overlay.trickNotes[String(index)] !== undefined;
    lines.push(`- 第 ${index + 1} 墩（${data.names[trick.leaderSeat]} 领出、${data.names[trick.winnerSeat]} 赢，${trick.points} 分）${fromOverlay ? '**（含我补写的）**' : '（你写的）'}：${note}`);
  }
  lines.push('');
  lines.push('## 开篇与收尾');
  lines.push('');
  lines.push('- 开篇：' + (authorIntro ? `（你写的）${data.intro}` : `（**我补写的**）${data.intro}`));
  lines.push('- 收尾：' + (authorOutro ? `（你写的）${data.outro}` : `（**我补写的**）${data.outro}`));
  lines.push('');
  lines.push(`来源标注：原话 = 你写的；${SOURCE_LABEL.polish} = 我只动了字句或按引擎事实改写；${SOURCE_LABEL.fill} = 原本没写、我补的。`);
  lines.push('');
  return lines.join('\n');
}
