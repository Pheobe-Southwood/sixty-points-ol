/**
 * 同桌页「面板归属」的**源码**守卫：哪些东西属于页头，哪些属于右侧活页签抽屉。
 *
 * 为什么需要它：手机端页头「爆满」已经发生过两次（一次是座位/观战徽标、一次是战报与身份入口），
 * 每次都是往页头再加一个按钮就好了，直到窄屏换行。行为层面没法在这里渲染验证
 * （要浏览器 + 真实视口宽度），所以改为对源码断言「页头里只允许出现这几样」，
 * 与 `page-source.test.ts`（观战者不许被当成「你」）是同一套路。
 *
 * 抽屉侧守两条更硬的边界：
 * - **动作面不进抽屉**：叫牌候选、确认埋底、出牌、发牌都不能在抽屉各页里出现
 *   （查阅面可以进，动作面进去就变成「改一次点两步」）；出牌与确认埋底住在毡面的
 *   `ActionTray` 里 —— 一个绝对定位、居中的独立浮层，不占操作条那一行，也不占文档流。
 * - **「我」页必须常驻 DOM**：它承载 `ui-check` / `spectate-check` 抓 SSR 的两处入口
 *   （「改名 / 换身份」与「座位已满」），一旦被改成 `{#if active === 'me'}`，
 *   那两条端到端守卫就会从「入口真的在页面上」退化成「标签名存在」。
 *
 * 还有一条关于**页头里不该有什么**：连接状态不是常驻指示器，只在 SSE 断开时
 * 于页头下方出一句话 —— 绿点已下线（手机上没有 hover 能解释它），但也不许反过来
 * 改成常显（每次加载闪一条、顶动牌桌）。
 *
 * 第四块是**本副结算弹窗**（`DealSummary`）：它 SSR 里永远不出现（`summaryOpen` 初值是 false，
 * 只在客户端「本副刚结算」那一帧打开），ui-check 够不到 —— 所以它只能落在源码这一层：
 * 算式的加减号（`kittySign` + 着色）、一行的结论（`scoreLineText`）、复用 `LevelBadge` 的升级表。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const page = read('../src/routes/table/[code]/+page.svelte');
const tabs = read('../src/lib/drawer-tabs.ts');
const rail = read('../src/lib/components/TabRail.svelte');
const drawer = read('../src/lib/components/TableDrawer.svelte');
const bidPanel = read('../src/lib/components/BidPanel.svelte');
const auctionRecord = read('../src/lib/components/AuctionRecord.svelte');
const buryPanel = read('../src/lib/components/BuryPanel.svelte');
const kittyPanel = read('../src/lib/components/KittyPanel.svelte');
const mePanel = read('../src/lib/components/MePanel.svelte');
const seatCard = read('../src/lib/components/SeatCard.svelte');
const seatActions = read('../src/lib/components/SeatActions.svelte');
const lobbyPanel = read('../src/lib/components/LobbyPanel.svelte');
const tableStatus = read('../src/lib/components/TableStatus.svelte');
const actionBar = read('../src/lib/components/ActionBar.svelte');
const actionTray = read('../src/lib/components/ActionTray.svelte');
const actionClock = read('../src/lib/components/ActionClock.svelte');
const trickArea = read('../src/lib/components/TrickArea.svelte');
const handFan = read('../src/lib/components/HandFan.svelte');
const dealSummary = read('../src/lib/components/DealSummary.svelte');

/** 剥掉注释再断言：注释里提到旧写法不构成引用（同 page-source.test.ts 的理由） */
function code(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function headerOf(source: string): string {
  const match = /<header[\s\S]*?<\/header>/.exec(code(source));
  assert.ok(match !== null, '同桌页里找不到 <header>，无法校验页头内容');
  return match[0];
}

const pageCode = code(page);
const header = headerOf(page);

test('页头只留必要信息：别的都在抽屉里，加一样就要在这里显式改白名单', () => {
  for (const banned of ['战报', '教程', '改名', '离座', '观战', 'HistoryList', 'IdentityQuickEdit']) {
    assert.equal(
      header.includes(banned),
      false,
      `页头里出现了「${banned}」：它属于右侧活页签抽屉（页头只剩 大厅 / 邀请码 / 观战者的入座）`
    );
  }
  for (const needed of ['← 大厅', 'InviteCode', 'SeatActions']) {
    assert.ok(header.includes(needed), `页头少了「${needed}」（这是页头白名单里必须保留的一项）`);
  }
  assert.ok(
    header.includes('variant="sit-only"'),
    '页头的入座按钮不是 sit-only 变体：页头只该有「入座」，离座与座位已满归「我」页'
  );
  // 连接圆点已下线：它只在没事的时候亮着，而手机上没有 hover 解释它。
  // 断线提示必须留在页头**之外**（见下一条测试），不然页头又会被撑高、回到老问题。
  for (const gone of ['dotClass', 'h-2 w-2 rounded-full', '连接中断']) {
    assert.equal(
      header.includes(gone),
      false,
      `页头里出现了「${gone}」：连接状态不再是常驻指示器，断线提示在页头下方单独成条`
    );
  }
});

test('连接状态只在断线时出声：正常态不占像素，也不许改成常显', () => {
  assert.ok(
    pageCode.includes("client.connection === 'offline'"),
    '断线提示不是「只在 offline 时出现」：常显会在每次加载时闪一条并顶动牌桌（见 CONTEXT.md）'
  );
  assert.ok(pageCode.includes('连接中断'), '找不到断线提示的文案（它要说明画面可能停在上一帧）');
  assert.ok(pageCode.includes('role="status"'), '断线提示缺 role="status"：读屏听不到重连');
});

test('四个页签与顺序只在 drawer-tabs.ts 里写一次，且与你的清单一致', () => {
  const order = ["{ key: 'report', label: '战报' }", "{ key: 'auction', label: '叫牌' }", "{ key: 'kitty', label: '底牌' }", "{ key: 'me', label: '我' }"];
  let cursor = -1;
  for (const entry of order) {
    const at = tabs.indexOf(entry);
    assert.ok(at > cursor, `drawer-tabs.ts 里缺「${entry}」或顺序不对（应为 战报 → 叫牌 → 底牌 → 我）`);
    cursor = at;
  }
  assert.ok(code(rail).includes('DRAWER_TABS'), '页签条没有从 drawer-tabs.ts 读清单（会与抽屉各写一份）');
  assert.ok(code(drawer).includes('drawerTabLabel'), '抽屉标题没有从 drawer-tabs.ts 取（会与页签条各写一份）');
});

test('抽屉默认关闭且「我」页常驻：那两条抓 SSR 的端到端守卫靠它', () => {
  assert.ok(
    pageCode.includes('let active = $state<DrawerTabKey | null>(null)'),
    '抽屉的初始状态不是「关着」：不许自动打开（纯手动，见 CONTEXT.md）'
  );
  assert.ok(
    drawer.includes('hidden={active !== \'me\'}'),
    '「我」页不是常驻的（被写成 {#if active === \'me\'}）：改名/换身份与座位已满就不再出现在观战页的 SSR 里'
  );
  assert.ok(
    mePanel.includes('改名 / 换身份'),
    '「我」页里找不到「改名 / 换身份」（ui-check 与 spectate-check 都按这个字符串抓）'
  );
  assert.equal(
    code(drawer).includes('座位已满'),
    false,
    '座位已满应当由「我」页里的 SeatActions 渲染，不是抽屉自己写'
  );
});

test('查阅面进抽屉，动作面留桌面', () => {
  for (const [name, source] of [
    ['TableDrawer', drawer],
    ['KittyPanel', kittyPanel],
    ['MePanel', mePanel]
  ] as const) {
    for (const action of ['client.bury(', 'client.play(', 'client.bid(', 'client.deal(', 'client.newGame(']) {
      assert.equal(
        code(source).includes(action),
        false,
        `${name} 里出现了 ${action}：这是动作面，必须留在桌面（叫牌候选、确认埋底、出牌、发牌）`
      );
    }
  }
  // 叫牌记录只有**一份实现**：`AuctionInfo`（信息面）+ `AuctionHistory`（历史表），
  // 抽屉走 `AuctionRecord` 这个组合件，毡面面板直接拼两块 —— 它插在两者之间的只有候选档位
  // （顺序还要对，见 test/bid-panel.test.ts），自己不许写第二份记录。
  assert.ok(
    code(bidPanel).includes('AuctionInfo') && code(bidPanel).includes('AuctionHistory'),
    '毡面的叫牌面板没有复用 AuctionInfo / AuctionHistory（叫牌记录会出现第二份真相）'
  );
  assert.ok(
    code(auctionRecord).includes('AuctionInfo') && code(auctionRecord).includes('AuctionHistory'),
    '抽屉那侧的 AuctionRecord 没有把信息面与历史表拼起来（两处渲染会各自过期）'
  );
  for (const own of ['bidText(', 'highestCall(', '还没人叫']) {
    assert.equal(
      code(bidPanel).includes(own),
      false,
      `BidPanel 里出现了 ${own}：记录面必须留在 AuctionInfo / AuctionHistory，` +
        '面板只负责把候选档位与「不叫」插在它们之间'
    );
  }
  assert.ok(
    code(kittyPanel).includes('buriedKitty'),
    '「底牌」页没有读 you.buriedKitty（它要的是庄家埋下去的那 3 张）'
  );
  // 动作面的**唯一**落点：毡面上的 ActionTray（出牌与埋底都在那里，且只在该你出手时出现）
  assert.ok(
    code(actionTray).includes('client.play(') && code(actionTray).includes('client.bury('),
    '动作托盘里找不到出牌/埋底：动作面（出牌、确认埋底）必须留在桌面'
  );
  assert.equal(
    code(kittyPanel).includes('originalKitty'),
    false,
    '「底牌」页引用了 originalKitty：拿上来的那 3 张只活在毡面的埋底面板里，两处不许混同'
  );
});


test('横跨毡面的覆盖层必须让开点击（否则座位卡上的动作按钮看得见、点不到）', () => {
  // 起因是一个实测 bug：`LobbyPanel` 的 `absolute inset-0` 铺满毡面、在 DOM 里又排在座位卡**之后**，
  // 于是刚开桌（还没发牌、两个空座）时「+ 机器人」按钮被它整层盖住 —— 看得见、点下去命中大厅层。
  // 规则：毡面级的覆盖层根节点一律 `pointer-events-none`，需要点的控件自己 `pointer-events-auto`；
  // 例外必须写进 EXEMPT 并说明理由（挡住座位卡动作的层不许例外）。
  const EXEMPT: Record<string, string> = {
    'BidPanel.svelte':
      '它自己就是滚动容器（max-h + overflow-y-auto）：让开点击会把滚轮一起让掉，反而点不到「不叫」',
    'TrickArea.svelte':
      '只在各家的出牌点上画牌（不是整面覆盖）；那条 bottom 横带只压到「我」的座位卡与观战锚点，两者都没有动作按钮'
  };

  /** 取根元素的 class（剥注释后第一个 section/div 的 class 属性） */
  function rootClass(source: string): string {
    const stripped = code(source);
    const match = /<(?:section|div|aside|figure)[^>]*\sclass=(?:"([^"]*)"|\{(\[[\s\S]*?\])\})/.exec(stripped);
    assert.ok(match !== null, '取不到根元素的 class');
    return match[1] ?? match[2]!;
  }

  const dir = new URL('../src/lib/components/', import.meta.url);
  const files = readdirSync(fileURLToPath(dir)).filter((name) => name.endsWith('.svelte'));
  const wide: string[] = [];
  for (const file of files) {
    const source = code(read(`../src/lib/components/${file}`));
    // 毡面级 = absolute 定位且横跨整幅（inset-0 / inset-x-0 / inset-x-3 都算）
    if (!/class="[^"]*\babsolute\b[^"]*\binset-(?:x-)?[03]\b/.test(source) && !/absolute inset-0/.test(source)) continue;
    wide.push(file);
    if (EXEMPT[file] !== undefined) continue;
    assert.ok(
      rootClass(read(`../src/lib/components/${file}`)).includes('pointer-events-none'),
      `${file} 横跨整幅毡面却没让开点击：它会在座位卡的「+ 机器人」/「请离」按钮上吃掉点击`
    );
  }
  // 断言不能空转：实测踩过的那个大厅层必须真的被扫进来
  assert.ok(wide.includes('LobbyPanel.svelte'), 'LobbyPanel.svelte 没被这条守卫扫到 —— 扫描规则可能失效了');
  // 这一版把两条信息条的定位搬进了牌桌页的列容器（`TableStatus` / `BuryPanel` 自己不再 absolute），
  // 所以「横跨整幅」的那一层现在是页面里的那两个 wrapper —— 同一条规则照它们扫：
  // 少了这一半，让开点击的保护就跟着组件一起搬走了，而座位卡上的按钮又会变得点不到。
  const layers = [...code(page).matchAll(/<div[^>]*class="([^"]*)"[^>]*>\s*<TableStatus/g)].map((m) => m[1]!);
  assert.ok(layers.length >= 2, `牌桌页里包着状态条的毡面层少于 2 个（实际 ${layers.length}）：扫描规则可能失效了`);
  for (const cls of layers) {
    assert.ok(
      cls.includes('pointer-events-none'),
      `牌桌页有横跨整幅的毡面层没让开点击：它会在座位卡的「+ 机器人」/「请离」按钮上吃掉点击 —— ${cls}`
    );
  }

  // 让开之后，可点的控件必须自己接回来，否则连邀请码 / 开始第一副 / 规则演示都点不动了
  for (const [name, source, minimum] of [
    ['LobbyPanel.svelte', lobbyPanel, 3], // 邀请码、开始第一副、规则演示链接
    ['BuryPanel.svelte', buryPanel, 1] // 「拿上来的底牌」那块
  ] as const) {
    const auto = code(source).split('pointer-events-auto').length - 1;
    assert.ok(auto >= minimum, `${name} 只接了 ${auto} 处 pointer-events-auto（至少要 ${minimum} 处）`);
  }
  // 三层里必须一个可点元素都不少（别用「删掉控件」来让守卫变绿）。
  // 埋底面板那一行这一版不再写「你拿上来的底牌」那句话（蓝框自己说话），所以认它的钩子。
  for (const [name, source, needle] of [
    ['LobbyPanel.svelte', lobbyPanel, 'InviteCode'],
    ['LobbyPanel.svelte', lobbyPanel, '开始第一副'],
    ['TableStatus.svelte', tableStatus, '定约'],
    ['BuryPanel.svelte', buryPanel, 'data-taken-kitty']
  ] as const) {
    assert.ok(source.includes(needle), `${name} 里少了「${needle}」`);
  }
});

test('动作按钮都要在有请求在飞时禁用（慢网下防双击），机器人按钮也不例外', () => {
  // 参照物：入座/离座一直是对的；加机器人这些后加的按钮当初漏了 busy 判断
  assert.ok(
    code(seatActions).includes('disabled={client.busy}'),
    '「入座」按钮不再禁用 busy —— 参照物变了，请检查这条守卫是不是在空转'
  );
  // 不用正则拼标签（标签里有 `+`，正则里是量词）——按 <button 切块找，读起来也直白
  const buttons = code(seatCard).split('<button').slice(1);
  for (const label of ['+ 机器人', '请离']) {
    const block = buttons.find((piece) => piece.includes(label));
    assert.ok(block !== undefined, `座位卡里找不到「${label}」按钮`);
    assert.ok(
      block.includes('disabled={busy}'),
      `「${label}」按钮没有 disabled={busy}：慢网下会被人连点两次`
    );
  }
  assert.ok(
    pageCode.includes('busy={client.busy}'),
    '同桌页没有把 client.busy 传给座位卡 —— 上面那条 disabled={busy} 就会永远是 false'
  );
  // 按钮位置必须带语义：点哪张空座卡就加进哪张（曾经过：无论点哪个都加进第一个空座）
  assert.ok(
    pageCode.includes('onAddBot={() => void addBot(seat)}'),
    '空座卡的「+ 机器人」没有把自己的座位传出去 —— 又会变成「点第二个、坐到第一个」'
  );
});

/* ---------- 埋底阶段：状态条与暗底槽位同列流 + 字号不许回潮 ---------- */

/**
 * 阶段状态条（定约 / 庄已抓）与埋底面板必须同属**一个**绝对定位的列容器，两者自己都不许定位。
 * 早先两者各定各的（状态条 `top-[5.5rem]`、埋底面板 `top-[12%]`），手机短屏上「定约 / 庄已抓」
 * 正好压在暗底槽位上 —— 两处各算各的位置，谁也管不了谁。这条在无浏览器的环境里只能落到源头上。
 *
 * 判据认的是「这个 class 里同时有 `absolute` 与 `inset-x-0`」，**不是字符串前缀**：
 * `pointer-events-none` 这类修饰就排在 `absolute` 前面（横跨整幅的层要让开点击）。
 */
function phaseStatusFlow(pageSource: string, statusSource: string, burySource: string): string | null {
  const flow =
    /<div class="[^"]*\babsolute\b[^"]*\binset-x-0\b[^"]*flex flex-col items-center[^"]*"[\s\S]*?<TableStatus \{view\} \/>[\s\S]*?<BuryPanel \{client\} \/>/.test(
      code(pageSource)
    );
  if (!flow) {
    return '牌桌页没有把状态条与埋底面板放进同一个绝对定位的列容器（各定各的位置，短屏上就会重叠）';
  }
  if (/\babsolute\b/.test(code(statusSource))) return 'TableStatus 自己绝对定位：它和埋底面板会各算各的位置';
  if (/\babsolute\b/.test(code(burySource))) return 'BuryPanel 自己绝对定位：它和状态条会各算各的位置';
  return null;
}

/** 状态条字号自检：定约 / 庄已抓要有大号数字，且不许回到 10px 的小号 chip */
function statusTypeCheck(statusSource: string): string | null {
  const src = code(statusSource);
  if (!/text-2xl/.test(src)) return '定约 / 庄已抓的数字没有 text-2xl：又缩回不显眼的小字了';
  if (/text-\[10px\]/.test(src)) return '状态条里又出现了 10px 小字（整条被缩回小 chip）';
  return null;
}

test('埋底阶段：状态条与暗底槽位同列流，短屏也不重叠', () => {
  const problem = phaseStatusFlow(page, tableStatus, buryPanel);
  assert.equal(problem, null, problem ?? '');
});

test('反证：各自绝对定位的旧版面必须被判出来', () => {
  const OLD_PAGE = `<TableStatus {view} />\n<BuryPanel {client} />`;
  assert.ok(
    phaseStatusFlow(OLD_PAGE, tableStatus, buryPanel) !== null,
    '旧版面（没有同列容器）被判为合规：这条守卫是空转的'
  );
  assert.ok(
    phaseStatusFlow(page, '<div class="absolute top-[5.5rem]">状态条</div>', buryPanel) !== null,
    '状态条自己绝对定位被判为合规'
  );
});

test('定约与庄已抓是大号数字（不再是小号 chip）', () => {
  const problem = statusTypeCheck(tableStatus);
  assert.equal(problem, null, problem ?? '');
});

test('反证：旧的 10px chip 版面必须被判出来', () => {
  const OLD_STATUS = `<div class="flex flex-wrap justify-center gap-1.5 px-2 text-[10px] sm:text-[11px]">
  <span class="rounded-full bg-black/35 px-2.5 py-1">第 <b>{trickNo}</b> 轮</span>
  <span class="rounded-full bg-black/35 px-2.5 py-1">定约</span>
</div>`;
  assert.match(statusTypeCheck(OLD_STATUS) ?? '', /text-2xl/, '旧版面没有被判出来');
});

test('埋底面板不再写标题行，也不写底牌说明句（钩子留着给 ui-check）', () => {
  const src = code(buryPanel);
  for (const gone of ['选 3 张扣入暗底', '庄家埋底中', '你拿上来的底牌']) {
    assert.equal(
      src.includes(gone),
      false,
      `BuryPanel 又写回了「${gone}」：阶段说明归「?」、动作提示归操作条，这里不写第二遍`
    );
  }
  assert.ok(
    src.includes('data-taken-kitty'),
    'BuryPanel 丢了 data-taken-kitty 钩子：ui-check 靠它认「拿上来的底牌」那一行'
  );
});

/* ---------- 出牌阶段：动作托盘、赢墩徽标、跟牌蓝框 ---------- */

/**
 * 动作控件（已选张数 / 出牌 / 清空 / 确认埋底）必须活在**独立的浮层**里，不许回到操作条那一行，
 * 而且那一层的形状有硬要求（每一条都对应一次真实返工）：
 * ① 页面必须把 `ActionBar` 与 `ActionTray` 放进同一个 `relative` 容器 —— 托盘是相对那一行定位的；
 * ② `absolute bottom-full`：钉在操作条**正上方**。居中悬在操作条上（`top-1/2 -translate-y-1/2`）
 *    时托盘会垂到操作条下面，而手牌就在那里 —— 截图里被盖住的就是手牌上半截；
 * ③ `flex-nowrap`：早先是 `flex-wrap`，窄屏上「清空」与红字各自挤出一行，托盘被撑到近 180px 高；
 * ④ `left-1/2 -translate-x-1/2`（居中，鼠标路程最短）+ `z-30`（压过 ActionBar 与毡面）；
 * ⑤ 不占流：轮到自己/轮空之间切换时毡面与手牌零回流；
 * ⑥ `w-max` + 每个 class 常量的 `whitespace-nowrap`：`left-1/2` 的绝对定位盒在 shrink-to-fit 下
 *    只有半个容器宽，子项被压缩后 CJK 会竖排（「出 牌」写成两行 —— 截图里那一次返工）。
 */
function trayCoupling(pageSource: string, barSource: string, traySource: string): string | null {
  const pageSrc = code(pageSource);
  if (!/<div class="relative">[\s\S]*?<ActionBar\b[\s\S]*?<ActionTray\b/.test(pageSrc)) {
    return '牌桌页没有把 ActionBar 与 ActionTray 放进同一个 relative 容器（托盘就无从相对那一行定位）';
  }
  const tray = code(traySource);
  for (const cls of ['absolute', 'bottom-full', 'left-1/2', '-translate-x-1/2', 'z-30', 'flex-nowrap']) {
    if (!tray.includes(cls)) return `ActionTray 缺少 ${cls}：单行浮层会走形（要么压住手牌，要么被撑成两行）`;
  }
  if (tray.includes('-translate-y-1/2')) {
    return 'ActionTray 又用 -translate-y-1/2 垂直居中了：托盘会垂到操作条下面盖住手牌，应当 bottom-full 钉在它上方';
  }
  if (/\bflex-wrap\b/.test(tray)) {
    return 'ActionTray 又允许换行（flex-wrap）：窄屏上「清空」与红字会各自挤出一行，把托盘撑高压住手牌';
  }
  if (/(^|[\s"'])w-full\b/.test(tray)) {
    return 'ActionTray 里出现了 w-full：错误提示一旦占满一行就会把托盘撑成两行（它必须绝对定位浮在上方）';
  }
  // ⑥ 宽度：`absolute` + `left-1/2` + 宽度 auto 时，shrink-to-fit 的可用宽度只有**半个**容器
  //    （手机上约 170px），flex 子项于是被压缩，而 CJK 可以在任意字间断行 ——「出 牌」「清 空」
  //    就竖排成两行了（计数带 nowrap 所以它没事，这正是截图里那条证据）。取**根开标签**判断：
  //    只扫全文会被错误气泡那枚 w-max 蒙混过去。
  const root = /<div[^>]*data-action-tray="true"[^>]*>/.exec(tray)?.[0] ?? '';
  if (!root.includes('w-max')) {
    return 'ActionTray 的根节点缺少 w-max：宽度会被压成半个容器，子项被压缩后「出 牌」会竖排';
  }
  // 第二道防线：每一个 class 常量都要带 whitespace-nowrap（计数 + 三个按钮）
  for (const name of ['count', 'gold', 'play', 'ghost']) {
    const match = new RegExp(`const ${name} =\\s*'([^']*)'`).exec(tray);
    if (match === null || !match[1]!.includes('whitespace-nowrap')) {
      return `ActionTray 的 ${name} 缺 whitespace-nowrap：被压缩时中文会在任意字间断行（「确认埋底」写成两行）`;
    }
  }
  if (!tray.includes('data-action-tray')) return 'ActionTray 丢了 data-action-tray 钩子：ui-check 靠它认出这一层';
  for (const gone of ['client.play(', 'client.bury(', '已选']) {
    if (code(barSource).includes(gone)) {
      return `ActionBar 里又出现了 ${gone}：动作控件必须只在 ActionTray（否则窄屏换行会顶动整页）`;
    }
  }
  return null;
}

/** 赢墩徽标只说分归哪一方（`trickSideBadge`）：旧的「上一轮 · 赢墩 +N 分」不许回来 */
function badgeCheck(trickAreaSource: string): string | null {
  const src = code(trickAreaSource);
  if (!src.includes('trickSideBadge')) {
    return '出牌区没有用 trickSideBadge：赢墩徽标会退回「上一轮 · 赢墩 +N 分」';
  }
  for (const gone of ['上一轮', '赢墩 +']) {
    if (src.includes(gone)) return `出牌区又写回了「${gone}」：徽标只报这 N 分归庄方还是闲方`;
  }
  return null;
}

/** 跟牌蓝框：领出那一门必须经 `followSuitCards` 接进 HandFan 的 marked */
function followMarkCheck(pageSource: string, fanSource: string): string | null {
  const src = code(pageSource);
  if (!src.includes('followSuitCards')) {
    return '牌桌页没有在跟牌时算领出那一门：跟牌看不到该跟哪几张（标记会一直是空的）';
  }
  if (!/marked=\{markedKeys\}/.test(src)) {
    return 'HandFan 的 marked 不再是 markedKeys：跟牌/埋底的蓝框标记接错了来源';
  }
  if (!/followSuitCards\(you\.hand, trump, deal\.trick\)/.test(src)) {
    return 'followSuitCards 的入参不对：应当是（我的手牌, trump, 当前墩）';
  }
  if (!code(fanSource).includes('marked')) {
    return 'HandFan 不再接受 marked：蓝框标记传不到牌面上';
  }
  return null;
}

test('出牌阶段：动作控件是钉在操作条上方的单行浮层，操作条只剩信息', () => {
  const problem = trayCoupling(page, actionBar, actionTray);
  assert.equal(problem, null, problem ?? '');
});

test('反证：托盘回到操作条行内、垂直居中、允许换行、错误提示占整行，都必须被判出来', () => {
  assert.ok(
    trayCoupling(page, actionBar, '<div class="flex gap-2">出 牌</div>') !== null,
    '流内托盘被判为合规：这条守卫是空转的'
  );
  assert.ok(
    trayCoupling(
      page,
      '<span>已选 {n} 张</span><button onclick={() => void client.play()}>出 牌</button>',
      actionTray
    ) !== null,
    '操作条里重新长出动作控件被判为合规'
  );
  assert.ok(
    trayCoupling('<ActionBar {client} />\n<ActionTray {client} />', actionBar, actionTray) !== null,
    '没有 relative 包裹（托盘无从定位）被判为合规'
  );
  // 截图里那一次：居中悬在操作条上 → 垂到手牌上。从**真实托盘**改一个字，
  // 这样它只会踩中这一条规则（用极简字面量当反例时，先撞上的往往是别的检查）。
  const CENTERED = actionTray.replace('absolute bottom-full', 'absolute top-1/2 -translate-y-1/2');
  assert.match(trayCoupling(page, actionBar, CENTERED) ?? '', /translate-y-1\/2/, '垂直居中的旧锚没有被判出来');
  // 换行 + 红字各占一行 → 撑高压住手牌
  const WRAPPING = actionTray.replace('flex w-max -translate-x-1/2 flex-nowrap', 'flex w-max -translate-x-1/2 flex-wrap');
  assert.match(trayCoupling(page, actionBar, WRAPPING) ?? '', /flex-nowrap/, '允许换行的托盘没有被判出来');
  // 精确性：`max-w-full` 这类「以 w-full 结尾的另一个类名」不该被误判成整行宽度
  const MAX_W = actionTray.replace('-translate-x-1/2 flex-nowrap', '-translate-x-1/2 max-w-full flex-nowrap');
  assert.equal(trayCoupling(page, actionBar, MAX_W), null, 'max-w-full 被误判成了 w-full（守卫过宽）');
  // 截图里那一次：根节点宽度只剩半个容器 ⇒ flex 子项被压缩 ⇒「出 牌」竖排
  assert.match(
    trayCoupling(page, actionBar, actionTray.replace('flex w-max', 'flex')) ?? '',
    /w-max/,
    '根节点丢掉 w-max（宽度被压成半个容器）没有被判出来'
  );
  // 第二道防线被删掉：某个 class 常量的 whitespace-nowrap 不见了
  assert.match(
    trayCoupling(
      page,
      actionBar,
      actionTray.replace(
        'play-btn inline-flex items-center justify-center whitespace-nowrap rounded-lg',
        'play-btn inline-flex items-center justify-center rounded-lg'
      )
    ) ?? '',
    /whitespace-nowrap/,
    '按钮的 whitespace-nowrap 被删掉没有被判出来'
  );
});

test('赢墩徽标只说「庄 / 闲 +N 分」', () => {
  const problem = badgeCheck(trickArea);
  assert.equal(problem, null, problem ?? '');
});

test('反证：旧的「上一轮 · 赢墩 +N 分」必须被判出来', () => {
  assert.ok(
    badgeCheck('<TrickCluster badge={`上一轮 · 赢墩 +${points} 分`} />') !== null,
    '旧徽标文案没有被判出来'
  );
});

test('跟牌时领出那一门接进 HandFan 的 marked', () => {
  const problem = followMarkCheck(page, handFan);
  assert.equal(problem, null, problem ?? '');
});

test('反证：标记接错来源 / 入参不对时必须被判出来', () => {
  assert.ok(
    followMarkCheck('<HandFan marked={markedKeys} />', handFan) !== null,
    '没有 followSuitCards 被判为合规'
  );
  assert.ok(
    followMarkCheck(
      page.replace('followSuitCards(you.hand, trump, deal.trick)', 'followSuitCards(you.hand, null, null)'),
      handFan
    ) !== null,
    'followSuitCards 的入参被换掉没有判出来'
  );
  assert.ok(
    followMarkCheck(page, '<div class="fan"></div>') !== null,
    'HandFan 不再接受 marked 没有判出来'
  );
});

/* ---------- 「距上一步」计时 ---------- */

/**
 * 计时的数据来源必须是**负载里的年龄**（服务端算的），不是浏览器自己「页面打开到现在」：
 * 后者在刷新/重连后会从 0 重来，把「这桌已经卡了 5 分钟」显示成「刚动过」。
 * 判据两条：操作条渲染了 `ActionClock` 并把 `client.table.actionAgeMs` 传进去；
 * 计时组件真的在走（`setInterval`），初值来自 prop（`formatElapsed(ageMs)`）。
 */
function clockWiring(barSource: string, clockSource: string): string | null {
  const bar = code(barSource);
  if (!bar.includes('<ActionClock')) return '操作条没有渲染 ActionClock：牌桌上没有「距上一步」计时';
  if (!bar.includes('actionAgeMs')) {
    return 'ActionClock 的年龄不是从负载里取的（缺 client.table.actionAgeMs）：刷新后计时会从 0 重来';
  }
  if (!/<ActionClock[^>]*class="ml-auto"/.test(bar)) {
    return '计时没有靠 ml-auto 停在操作条右端：它该像牌桌上的钟一样待在一边，而不是挤在「?」与状态句中间';
  }
  const clock = code(clockSource);
  if (!clock.includes('formatElapsed')) return '计时组件没有用 formatElapsed 写时长';
  if (!clock.includes('setInterval')) return '计时组件不会走时（缺 setInterval）：那只是一张静止的截图';
  if (!clock.includes('data-action-clock')) return '计时组件丢了 data-action-clock 钩子：ui-check 靠它认这个元素';
  if (!/elapsed !== null/.test(clock)) return '计时组件在还没有牌局（ageMs 为 null）时也会渲染：大厅里没有「上个动作」可说';
  return null;
}

test('「距上一步」计时读负载里的年龄，并且真的在走', () => {
  const problem = clockWiring(actionBar, actionClock);
  assert.equal(problem, null, problem ?? '');
});

test('反证：计时不渲染 / 从页面打开计时 / 不走时，都必须被判出来', () => {
  assert.ok(
    clockWiring('<div class="flex">?</div>', actionClock) !== null,
    '操作条里没有计时被判为合规'
  );
  assert.ok(
    clockWiring('<ActionClock ageMs={openedAt} />', actionClock) !== null,
    '年龄不从负载取（改成页面打开时刻）被判为合规'
  );
  assert.ok(
    clockWiring(actionBar, '<span data-action-clock="true">{formatElapsed(0)}</span>') !== null,
    '不走时的「时钟」被判为合规'
  );
  assert.ok(
    clockWiring(
      '<ActionClock ageMs={client.table.actionAgeMs} />',
      '<span data-action-clock="true">{formatElapsed(elapsed)}</span>'
    ) !== null,
    '计时没有停在操作条右端被判为合规'
  );
});

/* ---------- 本副结算弹窗：算式的符号、一行的结论、升级表 ---------- */

/** 取某个位置所在的那个标签（往回找最近的 `<`，往后截到第一个 `>`）—— 与 panel-guard.ts 同一套路 */
function tagOf(source: string, index: number): string {
  const start = source.lastIndexOf('<', index);
  const end = source.indexOf('>', index);
  if (start < 0 || end < 0) return '';
  return source.slice(start, end + 1);
}

/**
 * 本副结算弹窗的形状。四条判据各对应一次真实缺陷：
 * ① 算式里墩分与底牌之间的符号必须来自 `kittySign`（抠底 −、保底 +），与数字同级字号字重，
 *    并按保底/抠底着色 —— 早先这里硬写 `+`，抠底时显示出「60 + 10 × 1 = 50」这种自相矛盾的算式；
 * ② 结论只有一行（`scoreLineText`），不再有「两名闲家各升 ceil(差 / 10) = N 级；庄家级别不变」；
 * ③ 级别表复用座位卡那枚 `LevelBadge`（档位数字 + 金色「+过次」徽标），三家都出现、没升级的那行
 *    写「不变」—— 于是不必再单写一行「庄家级别不变。」，也不再是 `2(+0) → 3(+0)` 文本；
 * ④ 卡片有高度上限与自己的滚动区：结算内容高度不定，短屏上底部的「下一副 / 开新对局」曾在视口外。
 *
 * 这个弹窗**没法**交给 ui-check：`summaryOpen` 初值是 false，它只在客户端「本副刚结算」那一帧
 * 打开，SSR 里永远不出现 —— 所以它由这条源码守卫 + `labels.test.ts` 的纯函数单测两层守。
 */
function settlePanelCheck(source: string): string | null {
  const src = code(source);
  // 认**调用点**（`kittySign(`），不是 import：否则取到的是脚本顶部那行 import 所在的标签
  const call = src.lastIndexOf('kittySign(');
  if (call < 0) {
    return '结算算式没有用 kittySign：墩分与底牌之间会退回硬写的 `+`（抠底时显示出 60 + 10 = 50）';
  }
  const sign = tagOf(src, call);
  for (const cls of ['text-[26px]', 'font-black', 'text-emerald-300', 'text-rose-300']) {
    if (!sign.includes(cls)) {
      return `结算算式的加减号缺少 ${cls}：它决定「加还是扣」，要与数字同级字号并按保底/抠底着色 —— ${sign.slice(0, 150)}`;
    }
  }
  if (!src.includes('scoreLineText(')) {
    return '结算结论没有走 scoreLineText：又会写成「打输 · 差 N 分」再加一行 ceil(差 / 10)';
  }
  if (src.includes('两名闲家各升')) {
    return '结算结论又写回了「两名闲家各升 ceil(差 / 10) = N 级」：结论只有一行';
  }
  // 认**用法**而不是 import：否则删掉用法、留着 import 也能过（这条守卫就空转了）
  if (!src.includes('<LevelBadge')) {
    return '升级表没有复用 LevelBadge（档位数字 + 金色「+过次」徽标）：跨 A 的轮次读不出来';
  }
  if (src.includes('levelLabel(')) {
    return '结算弹窗又用了 levelLabel 文本：级别要复用 LevelBadge 那枚徽标';
  }
  if (!src.includes('levelRows(')) {
    return '升级表没有走 levelRows：三家不会都出现（没升级的那家会整行消失）';
  }
  if (src.includes('庄家级别不变')) {
    return '又写回了一行「庄家级别不变。」：没升级的那家在表里写「不变」';
  }
  if (!src.includes('不变')) {
    return '升级表里没有「不变」二字：没升级的那行会被读成没渲染出来';
  }
  if (src.includes('保底') || src.includes('抠底')) {
    return '结算弹窗又写回了保底/抠底那句说明：符号的红/绿已经说明了加还是扣';
  }
  const cardAt = src.indexOf('max-w-[94vw]');
  const card = cardAt < 0 ? '' : tagOf(src, cardAt);
  if (!card.includes('max-h-') || !card.includes('overflow-y-auto')) {
    return '结算卡片没有高度上限与自己的滚动区（max-h-* + overflow-y-auto）：短屏上底部的「下一副」会落到视口外';
  }
  return null;
}

test('本副结算弹窗：加减号带色、结论一行、级别表复用 LevelBadge', () => {
  const problem = settlePanelCheck(dealSummary);
  assert.equal(problem, null, problem ?? '');
});

test('反证：硬写 +、两行结论、levelLabel 文本、没有滚动区、保底说明回潮，都必须被判出来', () => {
  assert.ok(
    settlePanelCheck(dealSummary.replace('{kittySign(summary.protectedBottom)}', '+')) !== null,
    '硬写 `+` 的旧算式被判为合规（这条守卫是空转的）'
  );
  // 精确性：着色只认**符号自己那个标签**——把符号那处改成灰的，结论框的 rose 不该救它
  assert.ok(
    settlePanelCheck(dealSummary.replace("'text-rose-300'", "'text-white/40'")) !== null,
    '符号自己没着色（靠结论框的颜色蒙混）被判为合规'
  );
  assert.ok(
    settlePanelCheck(
      dealSummary.replace(
        '{scoreLineText(summary)}',
        '{scoreLineText(summary)}<p>两名闲家各升 ceil({summary.shortfall} / 10) = 1 级；庄家级别不变</p>'
      )
    ) !== null,
    '旧的两行结论被判为合规'
  );
  assert.ok(
    settlePanelCheck(dealSummary.replace('<LevelBadge level={row.to} />', '<b>{levelLabel(row.to)}</b>')) !== null,
    '退回 levelLabel 文本被判为合规'
  );
  assert.ok(
    settlePanelCheck(dealSummary.replaceAll('<LevelBadge', '<span data-old')) !== null,
    '升级表不再复用 LevelBadge 被判为合规'
  );
  assert.ok(
    settlePanelCheck(dealSummary.replace('levelRows(summary, view.levels)', 'summary.levelChanges')) !== null,
    '不是三家都出的旧列表被判为合规'
  );
  assert.ok(
    settlePanelCheck(dealSummary.replaceAll('不变', '—')) !== null,
    '没升级那行不写「不变」被判为合规'
  );
  assert.ok(
    settlePanelCheck(dealSummary.replace('max-h-[92dvh] ', '')) !== null,
    '卡片没有高度上限被判为合规'
  );
  assert.ok(
    settlePanelCheck(dealSummary + '\n<p>抠底 · 末轮被闲家赢走，底分 ×{summary.multiplier} 扣除</p>') !== null,
    '保底/抠底那句说明回潮被判为合规'
  );
});