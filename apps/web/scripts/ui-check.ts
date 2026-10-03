/**
 * 界面结构守卫：抓「只能靠肉眼发现」的版面与文案缺陷。
 *
 * 三类断言：
 * 1. Tailwind 的 position 工具类不可叠加 —— 产物里 .relative 排在 .absolute 之后，
 *    同一元素同时带两者时 relative 胜出，座位卡会塌回文档流、三张叠在毡面左上角。
 * 2. 说明文案只允许活在「?」弹层里：页面上不得再出现已删除的常驻提示，
 *    并且每一阶段都必须有那个「?」入口（title 随阶段变化）。
 * 3. 邀请码必须是一个可点的按钮（点它复制邀请链接），且界面上一律用玩家名，
 *    不得再出现东/南/西方位称谓。
 * 4. 牌面：大小王的角落（大+王）与正中（大王）必须指向同一张牌；牌角不得再有任何装饰圆点
 *    —— 这一条抓的是**出货样式表**，不是源码（源码删了但产物没重建，一样会被抓到）。
 * 另外对 /rules 跑同一套 position 守卫 —— 新写的版面正是最容易踩坑的地方。
 *
 * 运行：BASE=http://127.0.0.1:5178 node scripts/ui-check.ts
 */
const BASE = process.env['BASE'] ?? 'http://127.0.0.1:5178';

const POSITION_CLASSES = ['static', 'fixed', 'absolute', 'relative', 'sticky'] as const;

/** 已删除的常驻提示：任何页面都不该再出现 */
const REMOVED_HINTS = ['三人到齐后，任意一人点', '我的手牌 ·', '复制链接', '已入座 '] as const;

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

async function page(path: string, credential?: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`, {
    headers: credential === undefined ? {} : { cookie: `sixty_cred=${credential}` }
  });
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}`);
  return response.text();
}

/** 取页面里第一个样式表链接；抓不到就直接报错，绝不静默跳过（否则守卫会变成空转） */
function cssHrefOf(html: string): string {
  const match = /<link[^>]+href="([^"]+\.css)"/.exec(html);
  if (match === null || match[1] === undefined) throw new Error('页面里找不到样式表链接，无法校验出货 CSS');
  return match[1];
}

async function asset(href: string): Promise<string> {
  const url = href.startsWith('http') ? href : `${BASE}${href.startsWith('/') ? '' : '/'}${href}`;
  // 显式要求未压缩的原始文件：产物目录里同时有 .gz/.br 兄弟文件，
  // 带上 accept-encoding 会让同一个 URL 返回三种可能的内容，守卫就不再确定。
  const response = await fetch(url, { headers: { 'accept-encoding': 'identity' } });
  if (!response.ok) throw new Error(`GET ${url} → ${response.status}`);
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

/** 通用守卫：任何元素都不得混用两个 position 工具类 */
function assertNoPositionMix(html: string, where: string): void {
  const offenders = classAttrs(html)
    .map((value) => ({ value, found: positionClasses(value) }))
    .filter((entry) => entry.found.length > 1);
  assert(
    offenders.length === 0,
    `${where}：有 ${offenders.length} 处元素混用 position 工具类（Tailwind 中后定义者胜出，布局会意外塌陷）：\n` +
      offenders.map((o) => `  [${o.found.join(' + ')}] ${o.value.slice(0, 120)}`).join('\n')
  );
}

/** 说明文案必须只活在「?」弹层：对应阶段的弹层标题必须在页面上 */
function assertHelpTrigger(html: string, title: string, where: string): void {
  assert(
    html.includes(`title="${title}"`) && html.includes('aria-expanded'),
    `${where}：找不到「${title}」的 ? 说明入口`
  );
}

function assertNoRemovedHints(html: string, where: string): void {
  for (const hint of REMOVED_HINTS) {
    assert(!html.includes(hint), `${where}：仍出现已删除的常驻提示「${hint}」`);
  }
}

function assertNoCompassLabels(html: string, where: string): void {
  assert(!/[东南西]家/.test(html), `${where}：仍出现方位称谓（应改用玩家名/「你」）`);
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

  const lobby = await page(`/table/${code}`, players[0]!.credential);

  // 1) 大厅可开局（沿用 lobby-check 的口径，保证重构没弄丢入口）
  assert(lobby.includes('开始第一副'), '未开局页面没有渲染「开始第一副」按钮');

  // 2) 邀请码是可点按钮（点它复制邀请链接），不再有独立的「复制链接」按钮
  assert(lobby.includes('title="点击复制邀请链接"'), '邀请码不是可点的复制按钮');
  assert(
    /<button[^>]*aria-label="复制邀请链接"/.test(lobby),
    '邀请码的复制按钮缺少 aria-label'
  );

  // 3) 文案收敛：常驻提示已删，阶段说明只能从「?」进
  assertNoRemovedHints(lobby, '未开局页面');
  assertNoCompassLabels(lobby, '未开局页面');
  assertHelpTrigger(lobby, '准备阶段', '未开局页面');

  // 4) 座位卡必须钉在毡面四角（absolute），不能被自身 relative 覆盖
  const seatCards = classAttrs(lobby).filter(
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
  assertNoPositionMix(lobby, '未开局页面');

  // 5) 发牌后：仍是同一个「?」入口，但内容换成叫牌阶段；等待类提示与方位称谓都不该出现
  const dealt = await fetch(`${BASE}/api/tables/${code}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${players[0]!.credential}` },
    body: JSON.stringify({ action: { type: 'deal' } })
  });
  assert(dealt.ok, `发牌失败：${dealt.status}`);
  const auction = await page(`/table/${code}`, players[0]!.credential);
  assert(auction.includes('叫牌'), '发牌后页面没有进入叫牌界面');
  assertHelpTrigger(auction, '叫牌：定庄、定主', '叫牌页面');
  assertNoRemovedHints(auction, '叫牌页面');
  assertNoCompassLabels(auction, '叫牌页面');
  assert(!auction.includes('等待'), '叫牌页面仍有「等待」式常驻提示');
  assertNoPositionMix(auction, '叫牌页面');

  // 6) 教程页：新版面跑同一套 position 守卫，且小节与真实牌面都在
  const rules = await page('/rules');
  assertNoPositionMix(rules, '教程页');
  assert(!/[东南西]/.test(rules), '教程页仍出现方位称谓');
  for (const id of ['start', 'basics', 'trump', 'auction', 'bury', 'play', 'inference', 'scoring', 'levels']) {
    assert(rules.includes(`id="${id}"`), `教程页缺小节 ${id}`);
  }
  const ruleCards = (rules.match(/class="card[ "]/g) ?? []).length;
  assert(ruleCards >= 20, `教程页渲染的真实牌面过少（${ruleCards} 张），教程应复用牌组件而不是画方块`);

  // 7) 王牌面：角落（大+王）与正中（大王）必须指向同一张牌
  //    旧脸是角落写「大」、正中只写一个「王」字，同一张牌读出两种意思
  for (const name of ['大王', '小王']) {
    assert(rules.includes(`>${name}<`), `教程页没有渲染「${name}」的牌面`);
  }
  assert(
    !rules.includes('class="pip">王<'),
    '王牌面正中仍是孤零零的「王」字（旧脸回归）'
  );
  assert(!rules.includes('>王</span>'), '王牌面仍有只写「王」的元素（旧脸回归）');

  // 8) 角点已从出货产物里消失：牌角不再有装饰圆点，主牌只剩金边
  const cssHref = cssHrefOf(rules);
  const css = await asset(cssHref);
  assert(css.includes('.card.trump'), `样式表里找不到 .card.trump（抓到的可能不是牌面样式：${cssHref}）`);
  assert(css.includes('.card .pip'), '样式表里找不到 .card .pip（正对照失败）');
  assert(!css.includes('.card.pt'), '出货样式表里仍有分牌角点 .card.pt');
  assert(!/\.card\.trump:{1,2}after/.test(css), '出货样式表里仍有主牌角点 .card.trump::after');

  console.log('界面结构：position 工具类无混用，三张座位卡均为 absolute');
  console.log('文案：邀请码可点复制，常驻提示已清空，? 按阶段给说明，界面无方位称谓');
  console.log(`教程：9 个小节齐备，渲染 ${ruleCards} 张真实牌面；大小王牌面自洽`);
  console.log(`牌面：出货样式表 ${cssHref} 已无角点（.card.pt / .card.trump::after），主牌只剩金边`);
  console.log('UI OK');
}

main().catch((error: unknown) => {
  console.error('UI FAILED:', error instanceof Error ? error.message : error);
  // 用 exitCode 而非 process.exit：后者在 Windows 上可能打断仍在收尾的 async 句柄
  process.exitCode = 1;
});
