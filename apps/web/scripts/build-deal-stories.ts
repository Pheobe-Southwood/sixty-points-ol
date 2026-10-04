/**
 * 把 `docs/deals/` 里的牌局与讲解，转成演示页用的数据模块。
 *
 * 用法（在 apps/web 下）：
 *   node scripts/build-deal-stories.ts            # 全部重生成
 *   node scripts/build-deal-stories.ts 245        # 只做某几副
 *   node scripts/build-deal-stories.ts --check    # 只校验：仓库里的生成物与现场重算是否一致
 *
 * 每一步都过了 `convertStory` 的质检（回放合法、存证与回放一致、讲解无缺口、文案无方位称谓）。
 * 任何一条不过就**非零退出并列出全部问题**，绝不写半个文件 —— 宁可不出页，也不出错页。
 */
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertStory } from '../src/lib/story/convert.ts';
import { emitReview, emitStoriesIndex, emitStoryModule, storiesIndexPath, storyModulePath } from '../src/lib/story/emit.ts';
import { parseNotesOverlay } from '../src/lib/story/notes.ts';
import { parseStoryJson } from '../src/lib/story/export.ts';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const DEALS_DIR = join(REPO_ROOT, 'docs', 'deals');
const NOTES_DIR = join(DEALS_DIR, 'notes');

/** 页面上的顺序：先早局（2/4/5 级），再后期局（7+1/10+1/A） */
const ORDER = ['245', '222', 'deal-zhs7sx'] as const;

interface Loaded {
  readonly slug: string;
  readonly moduleText: string;
  readonly reviewText: string;
  readonly problems: readonly string[];
  readonly warnings: readonly string[];
}

function discoverSlugs(): string[] {
  const found = globSync('*.json', { cwd: DEALS_DIR })
    .map((name) => name.replace(/\.json$/, ''))
    .filter((slug) => !slug.endsWith('.review'));
  const ordered = ORDER.filter((slug) => found.includes(slug));
  const rest = found.filter((slug) => !(ORDER as readonly string[]).includes(slug)).sort();
  return [...ordered, ...rest];
}

function load(slug: string): Loaded {
  const problems: string[] = [];
  const warnings: string[] = [];
  const dealPath = join(DEALS_DIR, `${slug}.json`);
  const notesPath = join(NOTES_DIR, `${slug}.json`);

  if (!existsSync(dealPath)) {
    return { slug, moduleText: '', reviewText: '', problems: [`找不到牌局文件 ${dealPath}`], warnings };
  }
  if (!existsSync(notesPath)) {
    return { slug, moduleText: '', reviewText: '', problems: [`找不到讲解覆盖层 ${notesPath}`], warnings };
  }

  const parsed = parseStoryJson(readFileSync(dealPath, 'utf8'));
  if (!parsed.ok) {
    return { slug, moduleText: '', reviewText: '', problems: parsed.errors.map((error) => `牌局文件：${error}`), warnings };
  }

  const overlayRaw: unknown = JSON.parse(readFileSync(notesPath, 'utf8'));
  const overlay = parseNotesOverlay(overlayRaw, slug);
  if (typeof overlay === 'string') {
    return { slug, moduleText: '', reviewText: '', problems: [`讲解覆盖层：${overlay}`], warnings };
  }

  const converted = convertStory(parsed.story, overlay);
  warnings.push(...converted.warnings);
  if (converted.data === null) {
    return { slug, moduleText: '', reviewText: '', problems: converted.problems, warnings };
  }

  return {
    slug,
    moduleText: emitStoryModule(converted.data),
    reviewText: emitReview(
      converted.data,
      parsed.story.actions,
      overlay,
      parsed.story.intro.trim().length > 0,
      parsed.story.outro.trim().length > 0
    ),
    problems: converted.problems,
    warnings
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const requested = args.filter((arg) => !arg.startsWith('--'));
  const slugs = requested.length > 0 ? requested : discoverSlugs();

  if (slugs.length === 0) {
    console.error('docs/deals 下没有可用的牌局 JSON');
    process.exit(1);
  }

  const loaded = slugs.map(load);
  const allProblems = loaded.flatMap((item) => item.problems.map((problem) => `${item.slug}：${problem}`));

  const indexText = emitStoriesIndex(slugs);
  const indexFile = join(WEB_ROOT, storiesIndexPath());

  if (check) {
    for (const item of loaded) {
      if (item.problems.length > 0) continue;
      const moduleFile = join(WEB_ROOT, storyModulePath(item.slug));
      if (!existsSync(moduleFile)) {
        allProblems.push(`${item.slug}：生成物缺失 ${storyModulePath(item.slug)}，请先跑 node scripts/build-deal-stories.ts`);
        continue;
      }
      if (readFileSync(moduleFile, 'utf8') !== item.moduleText) {
        allProblems.push(`${item.slug}：${storyModulePath(item.slug)} 与现场重算不一致（有人手改了生成物，或改完 JSON/notes 忘了重跑）`);
      }
    }
    if (!existsSync(indexFile) || readFileSync(indexFile, 'utf8') !== indexText) {
      allProblems.push(`${storiesIndexPath()} 与现场重算不一致`);
    }
  } else if (allProblems.length === 0) {
    mkdirSync(dirname(indexFile), { recursive: true });
    for (const item of loaded) {
      writeFileSync(join(WEB_ROOT, storyModulePath(item.slug)), item.moduleText, 'utf8');
      writeFileSync(join(DEALS_DIR, `${item.slug}.review.md`), item.reviewText, 'utf8');
    }
    writeFileSync(indexFile, indexText, 'utf8');
  }

  for (const item of loaded) {
    for (const warning of item.warnings) console.log(`提示 ${item.slug}：${warning}`);
  }
  for (const item of loaded) {
    if (item.problems.length === 0) {
      console.log(`✓ ${item.slug} 转换完成（${check ? '校验通过' : '已写入'}）`);
    }
  }

  if (allProblems.length > 0) {
    console.error(`\n转换失败，共 ${allProblems.length} 条问题：`);
    for (const problem of allProblems) console.error(`  · ${problem}`);
    process.exit(1);
  }
  if (!check) console.log(`\n生成物：${loaded.length} 副故事 + 索引 + ${loaded.length} 份 review 清单`);
}

main();
