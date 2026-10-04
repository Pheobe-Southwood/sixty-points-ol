/**
 * 文档里的**路径**守卫：README 提到的仓库文件必须真的存在。
 *
 * 为什么需要：本 PR 把说明文本从 `apps/web/src/lib/help.ts` 搬进了引擎包（改名为
 * `packages/engine/src/help.ts`），引用它的代码都改了，README 那一行却漏了 ——
 * 于是文档把读者指到一个不存在的文件。这类错编译不报、测试不报，只有人去点才看得见，
 * 所以在这里按同一套路（读源码/文档做断言，见 `page-source.test.ts`、`help.test.ts`）钉住。
 *
 * 只认 `apps/…` 与 `packages/…` 这两种前缀的**仓库路径**：
 *   - `data/smoke-run.json` 这类是运行期产物，不该存在；
 *   - MCP 配置示例里的 `/path/to/sixty-points-ol/packages/mcp/src/stdio.ts` 是**真路径**，
 *     剥掉占位前缀之后要一起核对 —— 那一行本来就该是可用的路径。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../../..', import.meta.url);

/** 占位前缀（README 的 MCP 配置示例用 `/path/to/<仓库名>/` 表示「你本地的检出位置」） */
const PLACEHOLDER = /^\/path\/to\/[^/]+\//;

/**
 * 构建产物：`pnpm build` 产出 `apps/web/build`（adapter-node），`.svelte-kit` 是 SvelteKit 的工作目录。
 * README 提到它们是正常的，但它们在**干净检出里不存在** —— 要求它们存在的话，这个守卫就会
 * 在 CI 里红、而在「刚好构建过」的本机绿（第一版就是这么写错的，CI 抓出来的）。
 */
const BUILD_OUTPUT = /^(?:apps\/web\/)?(?:build|\.svelte-kit)(?:\/|$)/;

/** 从一段文本里挑出仓库内的路径引用 */
export function repoPathsIn(text: string): string[] {
  const found = new Set<string>();
  // 反引号里的路径，以及示例里裸露的路径（配置片段）
  for (const match of text.matchAll(/(?:^|[\s`"'(])((?:\/path\/to\/[^/\s`"')]+\/)?(?:apps|packages)\/[A-Za-z0-9._/-]+)/gm)) {
    const raw = match[1]!;
    const path = raw.replace(PLACEHOLDER, '');
    // 目录引用（以 / 结尾）、带通配的写法、构建产物都不当作「必须存在的文件」核对
    if (path.endsWith('/') || path.includes('*') || BUILD_OUTPUT.test(path)) continue;
    found.add(path);
  }
  return [...found];
}

test('守卫非空转：示例文本里该抓的都抓到、该剥的占位前缀剥掉', () => {
  assert.deepEqual(repoPathsIn('见 `packages/engine/src/help.ts`；'), ['packages/engine/src/help.ts']);
  assert.deepEqual(repoPathsIn('"args": ["/path/to/sixty-points-ol/packages/mcp/src/stdio.ts"]'), [
    'packages/mcp/src/stdio.ts'
  ]);
  // 目录（无扩展名也一样是路径引用，存在性检查按「文件或目录」算）
  assert.deepEqual(repoPathsIn('`packages/engine` 是纯 TS 规则引擎'), ['packages/engine']);
  // 运行期产物、目录、通配、构建产物都不该被当成「必须存在的文件」
  assert.deepEqual(repoPathsIn('把凭据存到 `data/smoke-run.json`'), []);
  assert.deepEqual(repoPathsIn('见 `apps/web/src/lib/` 目录'), []);
  assert.deepEqual(repoPathsIn('全部 `packages/*/src/index.ts`'), []);
  assert.deepEqual(repoPathsIn('pnpm build            # 产出 apps/web/build（adapter-node）'), []);
  assert.deepEqual(repoPathsIn('见 `apps/web/build/handler.js`'), []);
  // 正文里提到模块名（不带路径）不算路径引用
  assert.deepEqual(repoPathsIn('见 `help.ts` 与 `hub`'), []);
});

test('README 里提到的仓库路径都真的存在（文件或目录）', () => {
  const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
  const paths = repoPathsIn(readme);
  assert.ok(paths.length >= 5, `只抓到 ${paths.length} 条路径，提取规则可能失效了`);
  for (const path of paths) {
    assert.ok(existsSync(new URL(path, ROOT)), `README 指向了不存在的文件：${path}`);
  }
});
