/**
 * 引擎的时间/随机源边界：`src/**` 里**不许**出现 `Date.now()`、`new Date(`、`Math.random(`。
 *
 * 为什么值得钉一条：引擎的全部价值在于「同一状态 + 同一动作 ⇒ 同一结果」——
 * 可复现的整局回放、`mcp-check` 的固定种子、结算不变量测试都靠它。时间与全局随机源
 * 一旦溜进来（比如「计时/超时」顺手写进 `dispatch`），这些性质会**静默**失效：
 * 测试大多仍会绿，直到某天回放对不上。
 *
 * 需要随机数就传 `RNG` 参数（见 `newDeal(state, rng)`），需要时间就留在服务端
 * （浏览器那侧「距上一步」的计时读的是负载里的 `actionAgeMs`，见 CONTEXT.md）。
 * 注释里提到这些名字不算违规，所以断言前先剥掉注释。
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** 剥掉块注释与行注释：注释里讨论「为什么不许用 Date」不该被判违规 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}

test('引擎源码不碰时钟与全局随机源（可复现性的边界）', () => {
  const files = sourceFiles(SRC);
  assert.ok(files.length >= 8, `扫描到的引擎源文件太少（${files.length} 个），守卫会变成空转`);

  const banned = [/\bDate\.now\s*\(/, /\bnew\s+Date\s*\(/, /\bMath\.random\s*\(/];
  const offenders: string[] = [];
  for (const file of files) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const pattern of banned) {
      if (pattern.test(code)) offenders.push(`${file.replace(SRC, 'src')} ← ${pattern}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `引擎里出现了时间/全局随机源：${offenders.join('；')}\n` +
      '随机数走 RNG 参数、时间留在服务端 —— 否则整局回放与固定种子的测试会静默失效'
  );
});

test('反证：把违规写法喂给同一套判据必须被抓出来', () => {
  const banned = [/\bDate\.now\s*\(/, /\bnew\s+Date\s*\(/, /\bMath\.random\s*\(/];
  const dirty = [
    'const at = Date.now();',
    'const at = new Date().toISOString();',
    'const r = Math.random();'
  ];
  for (const line of dirty) {
    assert.ok(
      banned.some((pattern) => pattern.test(line)),
      `违规写法没有被判出来（守卫空转）：${line}`
    );
  }
  // 注释里提到它们不算违规
  assert.equal(banned.some((pattern) => pattern.test(stripComments('// 这里不许用 Date.now()'))), false);
});
