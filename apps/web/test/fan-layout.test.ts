/**
 * 手牌扇形布局单测：核心是「任何机型都不裁切」与「角标始终可读」两条不变量，
 * 外加一条回归——旧的固定重叠规则在 375px 上必然溢出（正是要修的问题）。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { BASE_STRIP_RATIO, computeFanLayout, minStrip, rowWidth } from '../src/lib/fan-layout.ts';

const EPS = 1e-6;

/** [机型名, 手牌容器可用宽度, 牌宽]；容器宽度 = 视口 - main 内边距，桌面受 max-w-6xl 限制 */
const DEVICES: readonly [string, number, number][] = [
  ['320', 320 - 24, 50],
  ['360', 360 - 24, 50],
  ['375', 375 - 24, 50],
  ['390', 390 - 24, 50],
  ['428', 428 - 24, 50],
  ['640', 640 - 32, 68],
  ['768', 768 - 32, 68],
  ['1024', 1024 - 32, 68],
  ['1280', 1120, 68] // max-w-6xl 封顶
];

function assertInvariants(count: number, cardWidth: number, containerWidth: number): void {
  const layout = computeFanLayout({ count, cardWidth, containerWidth });
  const base = cardWidth * BASE_STRIP_RATIO;
  const strip = minStrip(cardWidth);

  assert.equal(layout.rows, Math.ceil(count / layout.perRow), '行数应等于 ceil(张数/每行张数)');
  assert.ok(layout.perRow >= 1, '每行至少一张');
  assert.ok(layout.rows * layout.perRow >= count, '总容量应覆盖所有手牌');

  if (!layout.override) {
    assert.ok(count <= 1, '仅单张或未测量时才不覆盖');
    return;
  }

  // 间距不超过设计比例，也不低于角标可读下限
  assert.ok(layout.step <= base + EPS, `step ${layout.step} 不应超过设计比例 ${base}`);
  assert.ok(layout.step >= strip - EPS, `step ${layout.step} 不应低于可读下限 ${strip}`);
  assert.ok(layout.step <= cardWidth + EPS, 'step 不应超过牌宽');

  // 每一行都必须放得下（这是「最左一张不被裁」的充要条件）
  assert.ok(
    rowWidth(layout.perRow, cardWidth, layout.step) <= containerWidth + EPS,
    `行宽 ${rowWidth(layout.perRow, cardWidth, layout.step)} 超出容器 ${containerWidth}`
  );
}

test('单张与未测量：不做内联覆盖，交给 CSS 回退值', () => {
  assert.equal(computeFanLayout({ count: 1, cardWidth: 68, containerWidth: 800 }).override, false);
  assert.equal(computeFanLayout({ count: 20, cardWidth: 0, containerWidth: 800 }).override, false);
  assert.equal(computeFanLayout({ count: 20, cardWidth: 68, containerWidth: 0 }).override, false);
});

test('桌面宽屏：维持设计稿的紧凑扇形（每张露 40%）', () => {
  const layout = computeFanLayout({ count: 17, cardWidth: 68, containerWidth: 1120 });
  assert.equal(layout.rows, 1);
  assert.equal(layout.step, 68 * BASE_STRIP_RATIO);
  assert.ok(rowWidth(17, 68, layout.step) < 1120, '紧凑扇形不应铺满整行');
});

test('17 张在各机型都放得下（问题 2 的直接回归）', () => {
  for (const [viewport, containerWidth, cardWidth] of DEVICES) {
    assertInvariants(17, cardWidth, containerWidth);
    const layout = computeFanLayout({ count: 17, cardWidth, containerWidth });
    assert.ok(
      rowWidth(layout.perRow, cardWidth, layout.step) <= containerWidth + EPS,
      `${viewport}px：17 张溢出容器`
    );
  }
});

test('20 张（埋底阶段）在各机型都放得下', () => {
  for (const [viewport, containerWidth, cardWidth] of DEVICES) {
    const layout = computeFanLayout({ count: 20, cardWidth, containerWidth });
    assertInvariants(20, cardWidth, containerWidth);
    assert.ok(
      rowWidth(layout.perRow, cardWidth, layout.step) <= containerWidth + EPS,
      `${viewport}px：20 张溢出容器`
    );
  }
});

test('极窄机型 20 张切多行且每行都完整', () => {
  const layout = computeFanLayout({ count: 20, cardWidth: 50, containerWidth: 296 }); // 320px 机型
  assert.equal(layout.rows, 2, '320px 上 20 张应切两行');
  assert.equal(layout.perRow, 10);
  assert.ok(rowWidth(10, 50, layout.step) <= 296 + EPS);
});

test('单行但紧凑比例放不下时，用满可用宽度（不超过设计比例）', () => {
  const layout = computeFanLayout({ count: 17, cardWidth: 50, containerWidth: 351 }); // 375px 机型
  assert.equal(layout.rows, 1);
  assert.ok(layout.step > minStrip(50), '应比可读下限更宽松（用满可用宽度）');
  assert.ok(layout.step < 50 * BASE_STRIP_RATIO, '但不超过设计比例');
  assert.ok(Math.abs(rowWidth(17, 50, layout.step) - 351) < 0.5, '应正好铺满可用宽度');
});

test('回归：旧的固定重叠规则在 375px 上必然裁掉最左一张', () => {
  const oldMobileCardWidth = 52;
  const oldStep = oldMobileCardWidth * BASE_STRIP_RATIO; // margin-left: -0.6 × 牌宽
  const oldWidth = rowWidth(17, oldMobileCardWidth, oldStep);
  const available375 = 375 - 24;
  assert.ok(
    oldWidth > available375,
    `旧规则应溢出（${oldWidth} > ${available375}）；若不溢出说明回归用例本身失效`
  );
  // 新规则同样输入下必须放得下
  const fixed = computeFanLayout({ count: 17, cardWidth: 50, containerWidth: available375 });
  assert.ok(rowWidth(fixed.perRow, 50, fixed.step) <= available375 + EPS);
});

test('参数扫描：300..1500px × 1..20 张全部满足不变量', () => {
  let checked = 0;
  for (const cardWidth of [50, 68]) {
    for (let containerWidth = 300; containerWidth <= 1500; containerWidth += 10) {
      for (let count = 1; count <= 20; count++) {
        assertInvariants(count, cardWidth, containerWidth);
        checked++;
      }
    }
  }
  assert.equal(checked, 2 * 121 * 20, '扫描规模应与预期一致');
});
