/**
 * **解耦守卫**：音乐悬浮窗与主功能之间不许长出线来。
 *
 * 这一条不是风格洁癖，而是这次改动唯一的硬承诺（「该功能要与主功能完全解耦」）：
 * 它得在**源码层**可验证，而不是靠「我是这么写的」。
 *
 * 三段判据：
 * 1. **进向**：`src/lib/music/**` 只许 import 相对路径 / `svelte` / `$lib/music/...` ——
 *    一个引擎类型、一个牌桌客户端、一个服务端模块都不许碰；
 * 2. **出向**：`src/lib/music` 只许被**音乐组件**与牌桌页 import，且牌桌页里只许出现
 *    `MusicDock.svelte` 一个音乐路径；
 * 3. **服务端那半**：`src/lib/server/music.ts` 只许 import 三个模块（纯配置、纯适配层、
 *    `@sveltejs/kit` 的类型）—— 它**不许碰数据库、不许碰牌局**。
 *
 * 第 3 条要用**逐文件规则**表达（各文件一张白名单），不能把所有文件塞进同一条规则：
 * 那样写成规则里任何**一个**被允许的模块都会让整组通过（假绿）。这里两种都测，
 * 顺便证明「合并规则」这条路确实是错的。
 *
 * 沙箱内按包运行：node --import ./test/loader.mjs --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { importedModules, violationsOf, type GuardRule } from './import-scan.ts';

const MUSIC_DIR = new URL('../src/lib/music/', import.meta.url);
const ROUTE = '../src/routes/table/[code]/+page.svelte';
const routePage = readFileSync(new URL(ROUTE, import.meta.url), 'utf8');

/** 递归收集音乐模块里的源码文件（`.ts` 与 `.svelte` 都要扫） */
function musicFiles(dir = MUSIC_DIR): URL[] {
  const out: URL[] = [];
  for (const entry of readdirSync(dir)) {
    const child = new URL(entry, dir);
    if (statSync(fileURLToPath(child)).isDirectory()) {
      out.push(...musicFiles(new URL(`${entry}/`, dir)));
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.svelte')) out.push(child);
  }
  return out;
}

const FILES = musicFiles();
const relative = (url: URL): string => fileURLToPath(url).slice(fileURLToPath(new URL('..', import.meta.url)).length);

/** 音乐模块的每条 import：相对路径（模块内）、`svelte`（runes/onMount）、`$lib/music/*`（同块） */
function musicRule(): GuardRule {
  return { allow: ['svelte', '$lib/music/'], forbidden: [] };
}

function violationsInMusic(source: string): string[] {
  const rule = musicRule();
  return importedModules(source).filter(
    (module) =>
      !(module.startsWith('./') || module.startsWith('../')) &&
      module !== 'svelte' &&
      !module.startsWith('$lib/music/') &&
      !rule.allow.includes(module)
  );
}

test('守卫非空转：扫到的文件是全部（少一个都会让判据失真）', () => {
  const names = FILES.map(relative).sort();
  assert.ok(FILES.length >= 14, `只扫到 ${FILES.length} 个音乐文件，递归扫描可能失效了`);
  const has = (suffix: string): boolean => names.some((name) => name.endsWith(suffix));
  for (const suffix of ['types.ts', 'queue.ts', 'playback.ts', 'client.ts', 'player.svelte.ts', 'components/MusicDock.svelte']) {
    assert.ok(has(suffix), `没有扫到 ${suffix}（判据会形同虚设）`);
  }
});

test('进向：音乐模块不 import 任何主功能模块', () => {
  for (const file of FILES) {
    const violations = violationsInMusic(readFileSync(file, 'utf8'));
    assert.deepEqual(violations, [], `${relative(file)} 引入了音乐模块之外的东西：${violations.join(', ')}`);
  }
});

test('进向反证：引擎 / 牌桌客户端 / 服务端模块混进来必须被判出来', () => {
  const samples: readonly (readonly [string, string, RegExp])[] = [
    ['引擎类型', "import type { Card } from '@sixty/engine';", /@sixty\/engine/],
    ['牌桌客户端', "import { TableClient } from '$lib/client/table.svelte';", /\$lib\/client/],
    ['服务端模块', "import { db } from '$lib/server/db';", /\$lib\/server/],
    ['动态 import 也认', "const m = await import('$lib/shared');", /\$lib\/shared/],
    ['副作用 import 也认', "import '$lib/labels';", /\$lib\/labels/]
  ];
  for (const [name, snippet, pattern] of samples) {
    const violations = violationsInMusic(snippet);
    assert.equal(violations.length, 1, `${name}：没有被判出来（守卫空转）`);
    assert.match(violations[0] ?? '', pattern);
  }
  // 反向：本该允许的写法不许误伤
  assert.deepEqual(violationsInMusic("import { onMount } from 'svelte';"), []);
  assert.deepEqual(violationsInMusic("import { formatTime } from './format.ts';"), []);
  assert.deepEqual(violationsInMusic("import type { Track } from '../music/types.ts';"), []);
});

test('出向：牌桌页只认识 MusicDock 这一个音乐路径，且只挂一行', () => {
  const musicImports = [...routePage.matchAll(/from\s+['"](\$lib\/music\/[^'"]+)['"]/g)].map((match) => match[1]!);
  assert.deepEqual(musicImports, ['$lib/music/components/MusicDock.svelte'], '牌桌页 import 了不止一个音乐模块');
  assert.equal(routePage.match(/<MusicDock\b/g)?.length, 1, 'MusicDock 在牌桌页出现了不止一次');
  assert.ok(routePage.includes('<MusicDock enabled={data.musicEnabled} level={data.musicLevel} />'), 'MusicDock 的挂法变了');
  // 牌桌页不许直接碰播放器：入口只有组件
  for (const forbidden of ['player.svelte', 'MusicPlayer', 'createMusicClient', 'songUrl(']) {
    assert.ok(!routePage.includes(forbidden), `牌桌页里出现了 ${forbidden}：音乐逻辑漏进主功能了`);
  }
});

/** 允许引用音乐模块的文件（除此之外都算越界） */
const ALLOWED_REFERRERS = new Set([
  // 牌桌页：唯一入口，一行 import + 一行标签
  'src/routes/table/[code]/+page.svelte',
  // 适配层是客户端与服务端**共用**的那一半（所以住在 lib 根下）：它只从这里取
  // `SearchKind` 一个类型（`import type`，编译后不产生任何运行期依赖）。
  // 它是这条规则里唯一的例外，写在这里是为了让下一个人一眼看到「例外只有这一个」。
  'src/lib/music-adapters.ts'
]);

test('出向：除牌桌页与适配层，没有第三方引用音乐', () => {
  const roots = [
    new URL('../src/lib/', import.meta.url),
    new URL('../src/routes/', import.meta.url),
    new URL('../scripts/', import.meta.url)
  ];
  const offenders: string[] = [];
  const walk = (dir: URL): void => {
    for (const entry of readdirSync(dir)) {
      const child = new URL(entry, dir);
      if (statSync(fileURLToPath(child)).isDirectory()) {
        // 整棵音乐子树跳过（含 `music/components/`）：模块内部引用自己是正常的
        if (entry === 'music') continue;
        walk(new URL(`${entry}/`, dir));
        continue;
      }
      if (!entry.endsWith('.ts') && !entry.endsWith('.svelte')) continue;
      const path = relative(child);
      if (ALLOWED_REFERRERS.has(path)) continue;
      const source = readFileSync(child, 'utf8');
      // 两种写法都要认：`$lib/music/...`，以及从别处相对过去时路径里带 `music/` 那一段的
      // （`../music/x` 在 `src/lib/components/` 下指的就是音乐模块）。
      // 注意**不能**写成 `\.\./music/`：音乐模块自己内部也有 `../icons.ts` 这种写法，
      // 一刀切会把模块内部正常的引用当成越界（第一版就是这么误报的）。
      if (/\$lib\/music\//.test(source) || /from\s+['"][^'"]*music\//.test(source)) offenders.push(path);
    }
  };
  for (const root of roots) walk(root);
  assert.deepEqual(offenders, [], `这些文件引用了音乐模块（应当只有牌桌页与适配层）：${offenders.join(', ')}`);
});

test('服务端那半：`lib/server/music.ts` 只许 import 纯配置、纯适配层与 kit 的类型', () => {
  const serverFile = fileURLToPath(new URL('../src/lib/server/music.ts', import.meta.url));
  const source = readFileSync(serverFile, 'utf8');
  const rule: GuardRule = {
    allow: ['$lib/music-config.ts', '$lib/music-adapters.ts', '@sveltejs/kit'],
    forbidden: ['db', 'saveGame', '$lib/server/tables', 'dispatch', 'structuredClone']
  };
  assert.deepEqual(violationsOf(source, rule), []);
});

test('反证：服务端那半若去碰数据库必须被判出来（逐文件规则确有作用）', () => {
  const serverFile = fileURLToPath(new URL('../src/lib/server/music.ts', import.meta.url));
  const source = readFileSync(serverFile, 'utf8');
  const rule: GuardRule = {
    allow: ['$lib/music-config.ts', '$lib/music-adapters.ts', '@sveltejs/kit'],
    forbidden: ['db', 'saveGame', '$lib/server/tables', 'dispatch', 'structuredClone']
  };
  const tampered = `${source}\nimport { db } from '$lib/server/db';\n`;
  const violations = violationsOf(tampered, rule);
  assert.ok(violations.some((item) => item === 'db'), '写进 `db` 没被判出来');
  assert.ok(
    violations.some((item) => item.startsWith('import $lib/server/db')),
    '新增的越界 import 没被判出来'
  );
});

test('合并规则的假绿（为什么必须逐文件）：一条规则同时管两个文件会漏', () => {
  const combined: GuardRule = {
    // 一个合并规则只能表达「并集」：适配层被允许的东西，服务端文件也跟着被放行
    allow: ['$lib/music-config.ts', '$lib/music-adapters.ts', '@sveltejs/kit', '$lib/music/types.ts'],
    forbidden: []
  };
  const sneaky = "import type { Track } from '$lib/music/types.ts';";
  assert.deepEqual(violationsOf(sneaky, combined), [], '合并规则放行了它');
  // 逐文件规则里，服务端文件并不允许这条 —— 所以守卫必须逐文件写
  const perFile: GuardRule = {
    allow: ['$lib/music-config.ts', '$lib/music-adapters.ts', '@sveltejs/kit'],
    forbidden: []
  };
  assert.deepEqual(violationsOf(sneaky, perFile), ["import $lib/music/types.ts"]);
});

test('音乐模块不 import 服务端模块，服务端也不 import 音乐组件（两个方向都堵住）', () => {
  for (const file of FILES) {
    const source = readFileSync(file, 'utf8');
    assert.ok(!/\$lib\/server\//.test(source), `${relative(file)} 引用了 $lib/server/`);
    if (file.pathname.endsWith('.svelte')) continue;
    assert.ok(!/\.svelte['"]/.test(source), `${relative(file)} 引用了 .svelte 组件`);
  }
});
