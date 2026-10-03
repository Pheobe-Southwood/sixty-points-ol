/**
 * 界面结构守卫：抓「只能靠肉眼发现」的版面缺陷。
 *
 * 背景：Tailwind 的 position 工具类不可叠加——产物里 .relative 排在 .absolute 之后，
 * 同一元素同时带两者时 relative 胜出，座位卡会塌回文档流、三张叠在毡面左上角。
 * 本脚本对 SSR 输出断言：任何元素都不得同时出现两个 position 工具类，且座位卡必须是 absolute。
 *
 * 运行：BASE=http://127.0.0.1:5178 node scripts/ui-check.ts
 */
const BASE = process.env['BASE'] ?? 'http://127.0.0.1:5178';

const POSITION_CLASSES = ['static', 'fixed', 'absolute', 'relative', 'sticky'] as const;

interface Credential {
  name: string;
  credential: string;
}

async function claim(name: string): Promise<Credential> {
  const response = await fetch(`${BASE}/api/auth/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error(`注册失败：${response.status}`);
  return (await response.json()) as Credential;
}

async function page(path: string, credential: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { cookie: `sixty_cred=${credential}` }
  });
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}`);
  return response.text();
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** 取页面上所有 class 属性值（含 Svelte 拼接后的结果） */
function classAttrs(html: string): string[] {
  return [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1] ?? '');
}

/** 一个 class 串里出现的 position 工具类（只认完整类名，避免 relative-x 误判） */
function positionClasses(classValue: string): string[] {
  const tokens = classValue.split(/\s+/);
  return POSITION_CLASSES.filter((p) => tokens.includes(p));
}

async function main(): Promise<void> {
  const stamp = Date.now() % 100000;
  const players = await Promise.all([0, 1, 2].map((i) => claim(`界面${i}-${stamp}`)));

  const created = (await fetch(`${BASE}/api/tables`, {
    method: 'POST',
    headers: { authorization: `Bearer ${players[0]!.credential}` }
  }).then((r) => r.json())) as { code: string };
  const code = created.code;

  for (const player of players.slice(1)) {
    const response = await fetch(`${BASE}/api/tables/${code}/join`, {
      method: 'POST',
      headers: { authorization: `Bearer ${player!.credential}` }
    });
    assert(response.ok, `入座失败：${response.status}`);
  }

  const html = await page(`/table/${code}`, players[0]!.credential);

  // 1) 大厅可开局（沿用 lobby-check 的口径，保证重构没弄丢入口）
  assert(html.includes('开始第一副'), '未开局页面没有渲染「开始第一副」按钮');

  // 2) 通用守卫：任何元素都不得混用两个 position 工具类
  const offenders = classAttrs(html)
    .map((value) => ({ value, found: positionClasses(value) }))
    .filter((entry) => entry.found.length > 1);
  assert(
    offenders.length === 0,
    `有 ${offenders.length} 处元素混用 position 工具类（Tailwind 中后定义者胜出，布局会意外塌陷）：\n` +
      offenders.map((o) => `  [${o.found.join(' + ')}] ${o.value.slice(0, 120)}`).join('\n')
  );

  // 3) 座位卡必须钉在毡面四角（absolute），不能被自身 relative 覆盖
  const seatCards = classAttrs(html).filter(
    (value) =>
      value.includes('rounded-2xl') &&
      (value.includes('left-3 top-3') || value.includes('right-3 top-3') || value.includes('bottom-3 left-3'))
  );
  assert(seatCards.length === 3, `应找到 3 张座位卡，实际 ${seatCards.length} 张`);
  for (const value of seatCards) {
    const found = positionClasses(value);
    assert(
      found.length === 1 && found[0] === 'absolute',
      `座位卡定位类应为唯一的 absolute，实际 [${found.join(' + ')}]：${value.slice(0, 120)}`
    );
  }

  console.log('界面结构：position 工具类无混用，三张座位卡均为 absolute');
  console.log('UI OK');
}

main().catch((error: unknown) => {
  console.error('UI FAILED:', error instanceof Error ? error.message : error);
  // 用 exitCode 而非 process.exit：后者在 Windows 上可能打断仍在收尾的 async 句柄
  process.exitCode = 1;
});
