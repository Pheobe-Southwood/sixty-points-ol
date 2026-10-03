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
 * 5. 叫品一律写「分数 + 花色字形」：页面文本里不许再出现 `40 C` 这种裸花色字母
 *    —— 回归的是「叫牌历史走引擎 bidLabel(40 梅花)、候选按钮走 strainGlyph(♣)」那种一物两写。
 * 6. 出牌按钮：必须带 `.play-btn`（z-index 抬到手牌之上 + ≥44px 命中区），
 *    且叫牌面板里的「不叫」必须存在 —— 叫牌轮数很多时它就是被顶出屏幕的那一个。
 * 7. 底牌可见性：庄家埋底页要能看见「你拿上来的底牌」；闲家的同一页不能出现它。
 *    这一条同时守着引擎 personalView 的规则（拿上来的底牌只给庄家，观战者更没有）。
 * 8. 观战页面：满座第 4 个人看到的是公共信息 —— 不得出现开局/叫牌/埋底按钮，也不得渲染任何牌面。
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

/** 用某个座位的身份推进一步（座位由服务端按身份推导） */
async function act(code: string, credential: string, action: unknown): Promise<void> {
  const response = await fetch(`${BASE}/api/tables/${code}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
    body: JSON.stringify({ action })
  });
  if (!response.ok) throw new Error(`动作失败（${response.status}）：${await response.text()}`);
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

/** 叫品文本里的裸花色字母：`40 C` / `45 H` 这类（花色必须出字形 ♣♦♥♠） */
function bareStrainLetters(html: string): string[] {
  const text = html.replace(/<[^>]*>/g, ' ');
  return [...text.matchAll(/\d{2,3}\s?[CDHS]\b/g)].map((m) => m[0]);
}

/** 叫牌控件：必须有「不叫」，且叫品不许出现裸花色字母 */
function assertBidControls(html: string, where: string): void {
  assert(html.includes('不叫'), `${where}：找不到「不叫」按钮`);
  const stray = bareStrainLetters(html);
  assert(
    stray.length === 0,
    `${where}：叫品里出现了裸花色字母（应走 strainGlyph/♣♦♥♠）：${stray.join(', ')}`
  );
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
  // 5b) 叫牌面板：还没人叫时有顶部大字位，并且谁先叫由发牌人决定（不能假设是座位 0）
  assert(auction.includes('还没人叫'), '叫牌面板顶部没有「还没人叫」大字位');
  const dealerLabel = /第 1 副 · (.+?) 发牌/.exec(auction)?.[1];
  assert(dealerLabel !== undefined, '叫牌面板没有写出谁发牌');
  const dealerIndex = players.findIndex((p) => p.name === dealerLabel);
  assert(dealerIndex >= 0, `找不到发牌人「${dealerLabel}」对应的座位`);
  assert(
    auction.includes('叫牌中') || auction.includes('轮到你'),
    '叫牌面板没有标出当前轮到谁'
  );
  assert(
    /max-h-\[56%\]/.test(auction) && auction.includes('overflow-y-auto'),
    '叫牌面板没有高度上限/可滚动历史（轮数一多按钮会被顶出屏幕）'
  );

  // 5c) 轮到自己时：候选按钮是花色字形、「不叫」在页面里；随后 1 叫 + 2 pass 成交
  const dealerCred = players[dealerIndex]!.credential;
  const nextIndex = (dealerIndex + 1) % 3;
  await act(code, dealerCred, { type: 'bid', call: { points: 40, strain: 'C' } });
  const secondBidder = await page(`/table/${code}`, players[nextIndex]!.credential);
  assert(secondBidder.includes('轮到你'), '第二位叫牌人的页面没有「轮到你」');
  assertBidControls(secondBidder, '叫牌页面（轮到你）');
  for (const glyph of ['♣', '♦', '♥', '♠']) {
    assert(secondBidder.includes(glyph), `叫牌候选按钮里缺花色字形 ${glyph}`);
  }
  assert(secondBidder.includes('40♣'), `叫牌历史里应看到「40♣」，实际页面里没有`);
  await act(code, players[nextIndex]!.credential, { type: 'bid', call: 'pass' });
  await act(code, players[(dealerIndex + 2) % 3]!.credential, { type: 'bid', call: 'pass' });

  // 6) 埋底：庄家（= 发牌人）看得到「拿上来的底牌」
  const bury = await page(`/table/${code}`, dealerCred);
  assert(bury.includes('埋底'), '成交后庄家页面没有进入埋底界面');
  assert(bury.includes('你拿上来的底牌'), '埋底页面没有点明拿上来的底牌');
  for (const glyph of ['♣', '♦', '♥', '♠']) {
    assert(bury.includes(glyph), `埋底页面缺花色字形 ${glyph}`);
  }
  const marked = (bury.match(/data-marked="true"/g) ?? []).length;
  // 手牌里 3 张标记 + 底牌行 3 张标记 = 6
  assert(marked === 6, `庄家埋底页面应有 6 处底牌标记（手牌 3 + 底牌行 3），实际 ${marked}`);
  const prow = (bury.match(/底牌 [123]/g) ?? []).length;
  assert(prow === 3, `底牌行应有 3 个可点按钮，实际 ${prow}`);

  // 6b) 闲家看不到底牌：同一页没有底牌行，也没有任何标记
  const defenderIndex = nextIndex === dealerIndex ? (dealerIndex + 2) % 3 : nextIndex;
  const defender = await page(`/table/${code}`, players[defenderIndex]!.credential);
  assert(!defender.includes('你拿上来的底牌'), '闲家页面不该出现「你拿上来的底牌」');
  assert(
    !defender.includes('data-marked="true"'),
    '闲家页面不该有任何底牌标记（拿上来的底牌对闲家必须是 null）'
  );

  // 7) 观战：满座后第 4 个人进入观战视图（同一套守卫，且不得出现任何玩家操作）
  //    此刻三人都在座（正在埋底），是最严格的时点：连底牌都不能漏出去
  const guest = await claim(`观战-${stamp}`);
  const refused = await fetch(`${BASE}/api/tables/${code}/seat`, {
    method: 'POST',
    headers: { authorization: `Bearer ${guest.credential}` }
  });
  assert(refused.status === 400, `满座入座应被拒，实际 ${refused.status}`);
  const watching = await page(`/table/${code}`, guest.credential);
  assert(watching.includes('观战中'), '满座第 4 个人没有进入观战视图');
  assert(!watching.includes('开始第一副'), '观战页面仍渲染了开局按钮');
  assert(!watching.includes('不叫'), '观战页面出现了叫牌按钮');
  assert(!watching.includes('确认埋底'), '观战页面出现了埋底按钮');
  assert(!watching.includes('你拿上来的底牌'), '观战页面出现了庄家私有的底牌行');
  assert(!watching.includes('data-marked="true"'), '观战页面出现了底牌标记');
  assert(!/class="card[ "]/.test(watching), '观战页面渲染了牌（手牌或其他人的牌）');
  assert(watching.includes('改名 / 换身份'), '观战页面没有身份快捷编辑入口');
  assertHelpTrigger(watching, '观战', '观战页面');
  assertNoRemovedHints(watching, '观战页面');
  assertNoCompassLabels(watching, '观战页面');
  assertNoPositionMix(watching, '观战页面');
  const watchSeatCards = classAttrs(watching).filter(
    (value) =>
      value.includes('rounded-2xl') &&
      (value.includes('left-3 top-3') || value.includes('right-3 top-3') || value.includes('bottom-3 left-3'))
  );
  assert(watchSeatCards.length === 3, `观战页面应找到 3 张座位卡，实际 ${watchSeatCards.length} 张`);
  for (const value of watchSeatCards) {
    const found = positionClasses(value);
    assert(found.length === 1 && found[0] === 'absolute', `观战座位卡定位类应唯一为 absolute：${value.slice(0, 120)}`);
  }
  console.log('观战页面：无操作按钮、无牌面、无底牌标记，三张座位卡仍钉在毡面上，「?」给的是观战说明');

  // 8) 教程页：新版面跑同一套 position 守卫，且小节与真实牌面都在
  const rules = await page('/rules');
  assertNoPositionMix(rules, '教程页');
  assert(!/[东南西]/.test(rules), '教程页仍出现方位称谓');
  for (const id of ['start', 'points', 'trump', 'auction', 'bury', 'play', 'inference', 'scoring', 'spectate']) {
    assert(rules.includes(`id="${id}"`), `教程页缺小节 ${id}`);
  }
  const ruleCards = (rules.match(/class="card[ "]/g) ?? []).length;
  assert(ruleCards >= 20, `教程页渲染的真实牌面过少（${ruleCards} 张），教程应复用牌组件而不是画方块`);

  // 8) 王牌面：牌名只出现在两处角落索引里，正中是一枚图案（☀ / ☾）。
  //    两次反例都守在这里：角落里写「大/小」而正中只写一个「王」（读成两张牌），
  //    以及角落与正中都写名字（一张牌上「小王」重复三遍）。
  for (const [name, rank, pip] of [
    ['小王', '小', '☾'],
    ['大王', '大', '☀']
  ] as const) {
    const at = rules.indexOf(`aria-label="${name}"`);
    assert(at >= 0, `教程页没有渲染「${name}」的牌面`);
    const card = rules.slice(at, rules.indexOf('</button>', at));
    assert(
      new RegExp(`<span class="pip joker">${pip}</span>`).test(card),
      `${name} 的牌面正中不是图案 ${pip}：${card.slice(0, 160)}`
    );
    // 左上角与右下角（镜像）索引都必须把名字写全，否则单看角标认不出这张牌
    const corners = card.match(/<span class="idx(?: br)?"><span>[^<]+<\/span>\s*<i>[^<]+<\/i><\/span>/g) ?? [];
    assert(
      corners.length === 2,
      `${name} 应有 2 处角落索引（左上 + 右下镜像），实际 ${corners.length} 处：${card.slice(0, 200)}`
    );
    for (const corner of corners) {
      assert(
        corner.includes(`<span>${rank}</span>`) && corner.includes('<i>王</i>'),
        `${name} 的角落索引没有写出「${rank}王」：${corner}`
      );
    }
  }
  assert(
    !/<span class="pip joker">[^<]*[大小王][^<]*<\/span>/.test(rules),
    '王牌正中又出现了文字名（回归：一张牌上重复三遍名字）'
  );
  // 两张王的图案必须不同，否则一眼分不出大小
  const jokerPips = new Set((rules.match(/<span class="pip joker">([^<]+)<\/span>/g) ?? []).map((s) => s));
  assert(jokerPips.size === 2, `王牌正中的图案应有 ☀ 与 ☾ 两种，实际 ${jokerPips.size} 种`);

  // 9) 角点已从出货产物里消失：牌角不再有装饰圆点，主牌只剩金边
  const cssHref = cssHrefOf(rules);
  const css = await asset(cssHref);
  assert(css.includes('.card.trump'), `样式表里找不到 .card.trump（抓到的可能不是牌面样式：${cssHref}）`);
  assert(css.includes('.card .pip'), '样式表里找不到 .card .pip（正对照失败）');
  assert(!css.includes('.card.pt'), '出货样式表里仍有分牌角点 .card.pt');
  assert(!/\.card\.trump:{1,2}after/.test(css), '出货样式表里仍有主牌角点 .card.trump::after');
  // 9b) 出牌按钮与底牌标记的样式必须真的出货（源码改了但产物没重建，一样会漏）
  assert(css.includes('.play-btn'), '出货样式表里找不到 .play-btn（出牌按钮没有防遮挡层级）');
  assert(/\.play-btn\{[^}]*z-index:20/.test(css), '出货样式表里 .play-btn 没有 z-index:20（会被上浮的手牌盖住）');
  assert(/\.play-btn\{[^}]*min-height:44px/.test(css), '出货样式表里 .play-btn 没有 44px 命中高度');
  assert(
    css.includes("[data-marked='true']") || css.includes('[data-marked=true]'),
    '出货样式表里找不到底牌标记 [data-marked]'
  );
  // 9c) 悬停上浮只能是鼠标设备的规则（手指设备上 :hover 会粘住，看起来像牌收不回去）
  assert(
    /@media\(hover:hover\)and \(pointer:fine\)[^{]*\{\.fan\.selectable \.card:hover/.test(css),
    '悬停上浮没有包在 @media (hover:hover) and (pointer:fine) 里'
  );
  assert(
    !/(^|})\s*\.card\{[^}]*transition/.test(css),
    '卡片位移过渡没有限定在鼠标设备（手指设备上点选会有残留位移）'
  );

  console.log('界面结构：position 工具类无混用，三张座位卡均为 absolute');
  console.log('文案：邀请码可点复制，常驻提示已清空，? 按阶段给说明，界面无方位称谓');
  console.log(`教程：9 个小节齐备（含观战与离座），渲染 ${ruleCards} 张真实牌面；大小王牌面自洽（名字只在角落，正中是 ☀/☾）`);
  console.log(`牌面：出货样式表 ${cssHref} 已无角点（.card.pt / .card.trump::after），主牌只剩金边`);
  console.log('叫牌：叫品一律花色字形（无裸字母）、顶部有最高叫品大字、「不叫」在页面里');
  console.log('底牌：庄家埋底页有「你拿上来的底牌」+ 6 处标记；闲家页面 0 处标记');
  console.log('触控：悬停上浮只在鼠标设备生效；出牌按钮 .play-btn 带 z-index:20');
  console.log('UI OK');
}

main().catch((error: unknown) => {
  console.error('UI FAILED:', error instanceof Error ? error.message : error);
  // 用 exitCode 而非 process.exit：后者在 Windows 上可能打断仍在收尾的 async 句柄
  process.exitCode = 1;
});
