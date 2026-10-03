/**
 * 同桌页的**源码**守卫：观战者不许被套上「你」或旧座位。
 *
 * 这里守的是一个具体回归：`+page.svelte` 曾经把布局锚点与文案座位写成
 * `anchorSeatOf(you?.seat ?? data.seat)`，而 `data.seat` 只是**上次 load** 的值。
 * 于是在多标签页里另一处离座（或离座当帧 SSE 先到、invalidateAll 后到）时，
 * 观战者会被当成还坐在旧座位上：墩上的 caption、战报都会把别人的牌叫成「你」。
 *
 * 行为本身没法在这里渲染验证（需要在浏览器里制造「SSR 数据过期 + SSE 已更新」的错位），
 * 所以改为对源码断言这两件事只由 `you` 决定，且 `data.seat` 不再出现
 * （与 help.test.ts 读源码核对教程写法是同一套路）。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/routes/table/[code]/+page.svelte', import.meta.url), 'utf8');
const load = readFileSync(new URL('../src/routes/table/[code]/+page.server.ts', import.meta.url), 'utf8');

/**
 * 剥掉注释再断言：注释里提到旧写法（比如解释「这里曾经回退到 data.seat」）不构成引用。
 * 只看真正会执行的代码，守卫才不会因为一句说明而变红、也不会被一句说明哄绿。
 */
function code(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

const pageCode = code(page);
const loadCode = code(load);

test('布局锚点与文案座位只由 you 决定，不再回退到过期的 SSR 座位', () => {
  assert.ok(
    pageCode.includes('anchorSeatOf(you?.seat ?? null)'),
    '布局锚点没有写成 anchorSeatOf(you?.seat ?? null)（回退到 data.seat 会让观战者顶在旧座位上）'
  );
  assert.ok(
    pageCode.includes('labelSeatOf(you?.seat ?? null)'),
    '文案座位没有写成 labelSeatOf(you?.seat ?? null)（回退到 data.seat 会把别人的牌叫成「你」）'
  );
  assert.equal(
    /\bdata\.seat\b/.test(pageCode),
    false,
    '同桌页的代码仍引用 data.seat：那是上次 load 的值，与每帧现算的 you 会错位'
  );
  assert.equal(
    /^\s*seat:/m.test(loadCode),
    false,
    '页面 load 又返回 seat 了：这个字段没有任何消费者，只会引来下一次「回退到过期座位」'
  );
});

test('观战者没有「我」：座位卡的 isMe 由 you 判定', () => {
  assert.ok(
    pageCode.includes('isMe={seated && seat === (you?.seat ?? -1)}'),
    '座位卡的 isMe 判定被改动了：观战者不该在任何座位卡上显示「我」'
  );
  assert.ok(pageCode.includes('{#if you !== null}'), '手牌区没有按 you 是否存在来渲染');
});
