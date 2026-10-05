/**
 * 级别呈现的回归守卫，三条：
 *
 * 1. **点数一律写 J/Q/K/A**。引擎的 `levelLabel` 与 web 的 `levelParts` 原来各自判 `=== 14`
 *    映射成 A，于是 11/12/13 打成「11/12/13」，而编排台（`StudioInspector` 用的是 `rankLabel`）
 *    同一枚级别写 J/Q/K —— 同一个东西两种字形。现在两边都走 `rankLabel`。
 * 2. **轮数靠样式分层，不靠「点数更大」**。级别记作 `点数(+轮数)`，数值化是
 *    `13 × 轮数 + 档位序号`：轮数权重 13、档位只有 1。只放大档位就会把跨 A 的升级
 *    （`A(+0)`=12 → `2(+1)`=13）看成掉级。`levelTone` 让主数字与药丸随轮数一起加深。
 * 3. **`levelTone` 只许用不参与布局的属性**。它若返回 `w-*` / `text-sm` / `leading-*` 之类，
 *    徽标宽高就会随轮数变化 —— 座位卡名字列只剩 3.6px 余量（药丸 20.41px、名字要 76px），
 *    徽标一变宽就会把刚修好的机器人名字重新挤成两行。
 *
 * 第 4 条是**级别文本只有一个来源**：拼 `(+N)` 只允许发生在 `labels.ts` 与引擎的 `state.ts`，
 * 别处一律调 `levelLabel`/`levelParts`（早先 7 处各拼各的，`rules` 与 `DeckWidget` 还各抄了一份
 * `rank === 14 ? 'A' : rank`）。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { levelLabel, type Rank } from '@sixty/engine';
import { levelParts, levelTone } from '../src/lib/labels.ts';

// ------------------------------------------------------------------ 1. J/Q/K/A

test('级别点数一律写 J/Q/K/A：11/12/13 不许写成数字', () => {
  const expected: readonly [Rank, string][] = [
    [2, '2'],
    [5, '5'],
    [10, '10'],
    [11, 'J'],
    [12, 'Q'],
    [13, 'K'],
    [14, 'A']
  ];
  for (const [rank, text] of expected) {
    // 参照物：2/5/10 必须原样，否则下面「11 变 J」可能只是把一切都改坏了
    assert.equal(levelLabel({ rank, cycle: 0 }), `${text}(+0)`, `引擎 levelLabel 的 ${rank} 不对`);
    assert.equal(levelParts({ rank, cycle: 0 }).rank, text, `levelParts 的 ${rank} 不对`);
  }
  // 老写法「11」必须被判出来（反证：这条守着上面那个期望不是空转）
  assert.notEqual(levelParts({ rank: 11, cycle: 0 }).rank, '11', '11 又写回数字了');
  assert.notEqual(levelParts({ rank: 13, cycle: 0 }).rank, '13', '13 又写回数字了');
  // 轮数照旧进括号
  assert.equal(levelLabel({ rank: 14, cycle: 1 }), 'A(+1)');
  assert.equal(levelParts({ rank: 12, cycle: 2 }).cycle, 2);
});

// ---------------------------------------- 2/3. levelTone：分层 + 只用非布局属性

const LAYOUT_CLASS = /^(?:w-|h-|size-|min-w-|max-w-|gap-|p[xytblr]?-|m[xytblr]?-|leading-|font-|tracking-|text-(?:xs|sm|base|lg|xl|\d))/;

/** ring 粗细：`ring-1` → 1，无 ring → 0。用来验「单调加深」而不是只验互不相同 */
function ringWidth(classes: string): number {
  const match = /(?:^|\s)ring-(\d+)(?:\s|$)/.exec(classes);
  return match === null ? 0 : Number(match[1]);
}

test('levelTone：轮数越高越显眼，且四档互不相同', () => {
  const tones = [0, 1, 2, 3].map((cycle) => levelTone(cycle));
  // 0 轮＝原样（不加任何类），这是「5(+0) 看起来就是起点」的锚点
  assert.deepEqual(tones[0], { rank: '', pill: '' }, '0 轮不该加任何样式');
  const signatures = tones.map((tone) => `${tone.rank}|${tone.pill}`);
  assert.equal(new Set(signatures).size, 4, `四档必须有四种样子：${JSON.stringify(signatures)}`);
  // 主数字：0 轮不变色，1 轮起一律金色（「跨过 A」这件事要在最大那个字上看得见）
  assert.equal(tones[0]!.rank, '');
  for (const tone of tones.slice(1)) assert.ok(tone.rank.includes('text-gold'), '过 A 之后主数字应转金');
  // 药丸：ring 粗细单调不减
  const rings = tones.map((tone) => ringWidth(tone.pill));
  for (let i = 1; i < rings.length; i++) {
    assert.ok(rings[i]! >= rings[i - 1]!, `ring 粗细不应回退：${rings.join(' < ')} 不单调`);
  }
  assert.ok(rings[3]! > rings[1]!, '最高档必须比第 1 档更显眼');
  // 超出正常上限（正常到 2(+3)，见 FINISH_ONE_AT）并入最高档，不许越界或抛错
  assert.deepEqual(levelTone(4), tones[3], '4 轮应并入最高档');
  assert.deepEqual(levelTone(-1), tones[0], '负轮数按 0 轮处理，不许产生莫名样式');
});

test('levelTone 只许用不参与布局的属性：徽标盒子不许随轮数变大小', () => {
  for (const cycle of [0, 1, 2, 3]) {
    const tone = levelTone(cycle);
    for (const classes of [tone.rank, tone.pill]) {
      for (const token of classes.split(/\s+/).filter((value) => value !== '')) {
        assert.ok(
          !LAYOUT_CLASS.test(token),
          `levelTone 返回了布局类「${token}」（第 ${cycle} 档）：徽标宽高会随轮数变化，` +
            '座位卡名字列只剩 3.6px 余量，一变宽就会把名字重新挤成两行'
        );
      }
    }
  }
  // 反证：把一条布局类混进去必须被判出来
  assert.ok(LAYOUT_CLASS.test('text-sm'), '黑名单认不出 text-sm');
  assert.ok(LAYOUT_CLASS.test('w-4'), '黑名单认不出 w-4');
  assert.ok(!LAYOUT_CLASS.test('text-gold'), 'text-gold 是颜色，不该被当成布局类');
  assert.ok(!LAYOUT_CLASS.test('ring-2'), 'ring 是 box-shadow，不参与布局，不该被拦');
});

// ------------------------------------------------ 4. 级别文本只有一个来源

/** 只允许这两个文件自己拼 `(+轮数)`：它们是「级别怎么写」的唯一生产者 */
const ALLOWED_PRODUCERS = ['apps/web/src/lib/labels.ts', 'packages/engine/src/state.ts'];

/** 拼级别文本的写法：模板串里的 `(+${…cycle})` 与 Svelte 里的 `(+{…cycle})` */
const INLINE_LEVEL = /\(\+\$?\{[^}]*cycle[^}]*\}/;
/** 另一种手写：自己判 14 映射 A（旧 `rank === 14 ? 'A' : rank`） */
const HAND_ROLLED_RANK = /rank === 14\s*\?\s*'A'/;

/** 返回违规清单（空数组＝干净）。纯函数，真实文件与违规样例走同一段判断 */
export function levelTextViolations(relativePath: string, source: string): string[] {
  if (ALLOWED_PRODUCERS.includes(relativePath)) return [];
  const found: string[] = [];
  if (INLINE_LEVEL.test(source)) found.push('自己拼 (+轮数)');
  if (HAND_ROLLED_RANK.test(source)) found.push('自己判 14 映射成 A');
  return found;
}

test('拼级别文本只允许发生在 labels.ts 与引擎 state.ts', () => {
  // 从 apps/web/test/ 出发：`..` = apps/web，`../../..` = 仓库根
  const roots = [
    ['../src', 'apps/web/src'],
    ['../scripts', 'apps/web/scripts'],
    ['../../../packages/engine/src', 'packages/engine/src']
  ] as const;

  let scanned = 0;
  for (const [relativeRoot, prefix] of roots) {
    const root = fileURLToPath(new URL(relativeRoot, import.meta.url));
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.(?:ts|svelte)$/.test(entry.name)) continue;
      const full = `${entry.parentPath}/${entry.name}`;
      const rel = `${prefix}/${full.slice(root.length + 1).split('\\').join('/')}`;
      // 测试文件自己会写这些字面量（本文件就写着），跳过
      if (prefixed(rel)) continue;
      const violations = levelTextViolations(rel, readFileSync(full, 'utf8'));
      assert.deepEqual(violations, [], `${rel} 又自己拼级别文本了：${violations.join('、')}`);
      scanned += 1;
    }
  }
  assert.ok(scanned > 100, `只扫到 ${scanned} 个文件，扫描根写错了（守卫会变成空转）`);
});

function prefixed(rel: string): boolean {
  return rel.startsWith('apps/web/test/') || rel.includes('/test/');
}

test('反证：内联拼级别文本的写法必须被判出来', () => {
  assert.deepEqual(levelTextViolations('apps/web/src/routes/foo/+page.svelte', '{`${rank === 14 ? \'A\' : rank}(+${level.cycle})`}'), [
    '自己拼 (+轮数)',
    '自己判 14 映射成 A'
  ]);
  assert.deepEqual(
    levelTextViolations('apps/web/src/lib/x.ts', '{step.from.rank === 14 ? \'A\' : step.from.rank}(+{step.from.cycle})'),
    ['自己拼 (+轮数)', '自己判 14 映射成 A']
  );
  // 合规写法不许被判出来
  assert.deepEqual(levelTextViolations('apps/web/src/lib/x.ts', '{levelLabel(level)}'), []);
  // 两个生产者自己豁免
  assert.deepEqual(
    levelTextViolations('apps/web/src/lib/labels.ts', 'return `${rankLabel(l.rank)}(+${l.cycle})`;'),
    []
  );
});
