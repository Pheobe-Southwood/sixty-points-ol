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
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const page = read('../src/routes/table/[code]/+page.svelte');
const tabs = read('../src/lib/drawer-tabs.ts');
const rail = read('../src/lib/components/TabRail.svelte');
const drawer = read('../src/lib/components/TableDrawer.svelte');
const bidPanel = read('../src/lib/components/BidPanel.svelte');
const kittyPanel = read('../src/lib/components/KittyPanel.svelte');
const mePanel = read('../src/lib/components/MePanel.svelte');

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
