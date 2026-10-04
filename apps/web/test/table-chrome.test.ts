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
 *   （查阅面可以进，动作面进去就变成「改一次点两步」）。
 * - **「我」页必须常驻 DOM**：它承载 `ui-check` / `spectate-check` 抓 SSR 的两处入口
 *   （「改名 / 换身份」与「座位已满」），一旦被改成 `{#if active === 'me'}`，
 *   那两条端到端守卫就会从「入口真的在页面上」退化成「标签名存在」。
 *
 * 还有一条关于**页头里不该有什么**：连接状态不是常驻指示器，只在 SSE 断开时
 * 于页头下方出一句话 —— 绿点已下线（手机上没有 hover 能解释它），但也不许反过来
 * 改成常显（每次加载闪一条、顶动牌桌）。
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
const kittyPanel = read('../src/lib/components/KittyPanel.svelte');
const mePanel = read('../src/lib/components/MePanel.svelte');
const seatCard = read('../src/lib/components/SeatCard.svelte');
const seatActions = read('../src/lib/components/SeatActions.svelte');
const lobbyPanel = read('../src/lib/components/LobbyPanel.svelte');
const tableStatus = read('../src/lib/components/TableStatus.svelte');
const buryPanel = read('../src/lib/components/BuryPanel.svelte');

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
  assert.ok(
    code(bidPanel).includes('AuctionRecord'),
    '毡面的叫牌面板没有复用 AuctionRecord（叫牌记录会出现第二份真相）'
  );
  assert.ok(
    code(kittyPanel).includes('buriedKitty'),
    '「底牌」页没有读 you.buriedKitty（它要的是庄家埋下去的那 3 张）'
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
  // 断言不能空转：这三个（实测踩过的大厅层 + 两条信息条）必须真的被扫进来
  for (const name of ['LobbyPanel.svelte', 'TableStatus.svelte', 'BuryPanel.svelte']) {
    assert.ok(wide.includes(name), `${name} 没被这条守卫扫到 —— 扫描规则可能失效了`);
  }

  // 让开之后，可点的控件必须自己接回来，否则连邀请码 / 开始第一副 / 规则演示都点不动了
  for (const [name, source, minimum] of [
    ['LobbyPanel.svelte', lobbyPanel, 3], // 邀请码、开始第一副、规则演示链接
    ['BuryPanel.svelte', buryPanel, 1] // 「拿上来的底牌」那块
  ] as const) {
    const auto = code(source).split('pointer-events-auto').length - 1;
    assert.ok(auto >= minimum, `${name} 只接了 ${auto} 处 pointer-events-auto（至少要 ${minimum} 处）`);
  }
  // 三层里必须一个可点元素都不少（别用「删掉控件」来让守卫变绿）
  for (const [name, source, needle] of [
    ['LobbyPanel.svelte', lobbyPanel, 'InviteCode'],
    ['LobbyPanel.svelte', lobbyPanel, '开始第一副'],
    ['TableStatus.svelte', tableStatus, '定约'],
    ['BuryPanel.svelte', buryPanel, '你拿上来的底牌']
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
