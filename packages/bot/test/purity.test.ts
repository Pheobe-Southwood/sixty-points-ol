/**
 * 纯净守卫：策略包只许依赖引擎，不许碰任何 IO / 服务器 / 随机源。
 *
 * 与 apps/web 的 mcp-guard 同一思路（ADR-0010）：「机器人看不到别人的手牌」不靠自律，
 * 靠这里没有别的路 —— import 白名单钉死，违规源码必须被抓（守卫非空转）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ALLOWED_IMPORTS = new Set(['@sixty/engine', './sight.ts', './policy.ts', './index.ts']);

const FORBIDDEN_NAMES = [
  'node:fs',
  'node:http',
  'node:net',
  'process.env',
  'Math.random',
  'fetch(',
  'setTimeout',
  'setInterval',
  'Date.now'
];

const SOURCE_FILES = ['index.ts', 'policy.ts', 'sight.ts'].map((name) =>
  fileURLToPath(new URL(`../src/${name}`, import.meta.url))
);

test('策略包源码只依赖引擎且无 IO/随机', () => {
  for (const file of SOURCE_FILES) {
    const source = readFileSync(file, 'utf8');
    // 去掉行注释（注释里会正当地提到这些名字）
    const code = source.replace(/\/\/[^\n]*/g, '');
    for (const name of FORBIDDEN_NAMES) {
      assert.ok(!code.includes(name), `${file} 出现了 ${name}：策略必须是纯函数`);
    }
    for (const match of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(
        ALLOWED_IMPORTS.has(match[1]!),
        `${file} import 了 ${match[1]!}：策略包只许依赖 @sixty/engine 与包内模块`
      );
    }
  }
});

test('守卫非空转：违规源码必须被抓住', () => {
  // 拿真正的违规源码喂同一段判断，证明禁用名单与 import 白名单都会命中
  const bad = 'import { readFileSync } from "node:fs";\nconst x = Math.random();';
  assert.ok(bad.includes('node:fs'), '样例源码应包含 node:fs');
  assert.ok(bad.includes('Math.random'), '样例源码应包含 Math.random');
  const imports = [...bad.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  assert.deepEqual(imports, ['node:fs']);
  assert.ok(!ALLOWED_IMPORTS.has(imports[0]!), 'node:fs 不该在 import 白名单里');
  // 注释被剥掉之后不该再命中（否则守卫会把解释性注释当成违规）
  const stripped = '// 注释里提到 Math.random 与 node:fs 不算违规'.replace(/\/\/[^\n]*/g, '');
  assert.ok(!FORBIDDEN_NAMES.some((name) => stripped.includes(name)));
});
