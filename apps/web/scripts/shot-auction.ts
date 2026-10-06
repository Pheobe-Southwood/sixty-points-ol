/**
 * 竞叫面板**验收截图**：把叫牌面板的四种场景与「▶ 跳叫」展开态拍成 PNG，供人工验收。
 *
 * 为什么不是一个「打开页面截个图」的命令：
 * 1. 面板按**座位身份**渲染（个人视图走 cookie），而且场景要一步步叫出来 —— 没人叫 / 最高 40♥ /
 *    最高 40♠ / 最高 40NT 四种「前一个人叫什么」的状态，只能靠 REST 推动叫牌到那一步；
 * 2. 因此脚本自己起一个服务端（vite dev，SSR 与产物同源）→ 用 REST 把局面推到位 →
 *    驱动无头 Chromium 逐场景截图。
 *
 * 为什么不跑 build 产物：产物里 `esm-env` 这类 kit 的间接依赖在本机（pnpm 用 junction、Node 不
 * realpath）会被 external 化，`node build/index.js` 当场解析失败 —— 那是本机的解析环境问题，
 * 与 UI 无关；截图要的是渲染结果，dev 的 SSR 与产物逐字同源。
 *
 * 浏览器走 CDP 而不是 Playwright：仓库没有 Playwright 依赖，而 Node 24 自带 WebSocket，
 * 连 CDP 只需要几个命令（Network.setCookie / Page.navigate / Page.captureScreenshot），
 * 不值得为此给仓库加一个重依赖。Chromium 复用本机 playwright 装好的那份（自动找 newest）。
 *
 * 运行：pnpm shot                 （脚本自己拉一个 vite dev，截图写到 apps/web/.shots/）
 *       pnpm shot http://host:port （对着已经在跑的服务端截图）
 * 产物：apps/web/.shots/*.png（目录已在 .gitignore 里）
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // apps/web/scripts
const webRoot = resolve(here, '..'); // apps/web
/** 截图产物放这里（在 .gitignore 里），交付给人看的就是这些 PNG */
const outDir = resolve(webRoot, '.shots');
/**
 * 运行期状态（浏览器 profile、sqlite 库、服务端日志）一律放**系统临时目录**，不放 .shots：
 * vite 会 watch 整个项目根，而浏览器 profile 里的 Cookies 是被 Chrome 锁住的文件，
 * 一被 watch 到就 `EBUSY` 把 dev server 整根掀掉（实测：服务起来了、几秒后崩），
 * sqlite 的 -wal/-shm 同理一直在动。
 */
const workDir = mkdtempSync(join(tmpdir(), 'sixty-shot-'));

interface Credential {
  readonly name: string;
  readonly credential: string;
}

let base = '';

/**
 * 带重试的请求：vite dev 在**首次请求**时做依赖预构建，构建完会重启一次 dev server，
 * 正在飞的那条请求就被 reset（ECONNRESET）。所以起完服务先热两次（见 `warmUp`），
 * 之后仍允许重试 —— 这里的重试是安全的：库是 `.shots/` 下的一次性库，而 ECONNRESET 意味着
 * 请求死在了重启窗口里（服务端没处理它）。
 */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      last = error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(`请求失败：${url}`);
}

/** 热启动：连续两次取到首页才算稳定（避开依赖预构建那次重启） */
async function warmUp(): Promise<void> {
  let stable = 0;
  for (let i = 0; i < 20 && stable < 2; i += 1) {
    try {
      stable = (await apiFetch(`${base}/`)).ok ? stable + 1 : 0;
    } catch {
      stable = 0;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (stable < 2) throw new Error(`服务端 ${base} 起不来或反复重启`);
}

/* ---------- 起服务端与浏览器 ---------- */

async function freePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => (port > 0 ? resolvePort(port) : reject(new Error('拿不到空闲端口'))));
    });
  });
}

async function waitFor(check: () => Promise<boolean>, label: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // 还没起来：继续等
    }
    if (Date.now() > deadline) throw new Error(`等待「${label}」超时（${timeoutMs}ms）`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** 起服务端：脚本自己拉一个 vite dev（SSR 与产物同源），不依赖外部先把服务跑起来 */
async function startServer(): Promise<{ process: ChildProcess | null; port: number }> {
  const given = process.argv.slice(2).find((arg) => arg.startsWith('http'));
  if (given !== undefined) {
    base = given.replace(/\/$/, '');
    await warmUp();
    return { process: null, port: new URL(base).port === '' ? 80 : Number(new URL(base).port) };
  }
  // 起 vite 必须用**真实路径**：pnpm 在 node_modules 里放的是 junction，Node 从 junction 路径
  // 解析 vite 自己的依赖（rollup 等）时找不到（那些在 .pnpm/<pkg>/node_modules 下），
  // 报 ERR_MODULE_NOT_FOUND。realpath 之后解析链才是它们在磁盘上的真实位置。
  const vite = realpathSync.native(resolve(webRoot, 'node_modules/vite/bin/vite.js'));
  if (!existsSync(vite)) throw new Error(`找不到 ${vite}：先在 apps/web 里 pnpm install`);
  const port = await freePort();
  // 服务端的输出落到文件而不是 pipe：一是沙箱里 piped stdio 会 EPERM，二是起不来时
  // 报错必须能带上它自己的那句话（否则只剩「超时」这种没信息量的失败）。
  const logPath = join(workDir, 'vite-dev.log');
  const logFd = openSync(logPath, 'w');
  // --host 127.0.0.1：vite 的默认 host 是 `localhost`，在本机可能只绑到 ::1，
  // 而这里（以及后面的浏览器）一律用 127.0.0.1 —— 不显式钉住就会「服务起来了但连不上」。
  const child = spawn(
    process.execPath,
    [vite, 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: webRoot,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, SIXTY_DB: join(workDir, 'acceptance.db') }
    }
  );
  base = `http://127.0.0.1:${port}`;
  try {
    await waitFor(async () => (await apiFetch(`${base}/`)).ok, 'vite dev 启动');
    await warmUp();
  } catch (error) {
    const tail = readFileSync(logPath, 'utf8').split('\n').slice(-25).join('\n');
    child.kill();
    throw new Error(`${String(error)}\nvite dev 的输出（${logPath}）：\n${tail}`);
  }
  return { process: child, port };
}

/** 本机 playwright 装好的 Chromium：版本号带后缀，取最新的那一份 */
function chromiumPath(): string {
  const root = join(process.env['LOCALAPPDATA'] ?? '', 'ms-playwright');
  const candidates = readdirSync(root)
    .filter((name) => name.startsWith('chromium-'))
    .map((name) => join(root, name, 'chrome-win64', 'chrome.exe'))
    .filter((path) => existsSync(path));
  const newest = candidates[candidates.length - 1];
  if (newest === undefined) throw new Error(`在 ${root} 里找不到 Chromium（chrome-win64/chrome.exe）`);
  return newest;
}

async function startChrome(): Promise<{ process: ChildProcess; port: number }> {
  const port = await freePort();
  const child = spawn(
    chromiumPath(),
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--disable-extensions',
      // 页面动画（pts-pop 等）会污染截图：统一按「减少动态效果」渲染
      '--force-prefers-reduced-motion',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${join(workDir, 'chrome-profile')}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).ok,
    'Chromium 启动'
  );
  return { process: child, port };
}

/* ---------- 最小 CDP 客户端 ---------- */

interface CdpSocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open', handler: () => void, options?: { once?: boolean }): void;
  addEventListener(type: 'error', handler: () => void, options?: { once?: boolean }): void;
  addEventListener(type: 'message', handler: (event: { data: unknown }) => void): void;
}

interface Cdp {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  close(): void;
}

function socketCtor(): new (url: string) => CdpSocket {
  const ctor = (globalThis as { WebSocket?: new (url: string) => CdpSocket }).WebSocket;
  if (ctor === undefined) throw new Error('这个 Node 没有全局 WebSocket（需要 Node 22+）');
  return ctor;
}

async function connectCdp(wsUrl: string): Promise<Cdp> {
  const socket = new (socketCtor())(wsUrl);
  await new Promise<void>((resolveOpen, reject) => {
    socket.addEventListener('open', () => resolveOpen(), { once: true });
    socket.addEventListener('error', () => reject(new Error(`连不上 CDP：${wsUrl}`)), { once: true });
  });
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: { message?: string };
    };
    if (typeof message.id !== 'number') return;
    const entry = pending.get(message.id);
    if (entry === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) entry.reject(new Error(message.error.message ?? 'CDP 报错'));
    else entry.resolve(message.result);
  });
  return {
    send(method, params) {
      const id = (nextId += 1);
      return new Promise((resolveCall, rejectCall) => {
        pending.set(id, { resolve: resolveCall, reject: rejectCall });
        socket.send(JSON.stringify({ id, method, params: params ?? {} }));
      });
    },
    close() {
      socket.close();
    }
  };
}

/* ---------- REST：把局面推到要拍的那一步 ---------- */

async function claim(name: string): Promise<Credential> {
  const response = await apiFetch(`${base}/api/auth/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error(`注册失败：${response.status}`);
  return (await response.json()) as Credential;
}

async function act(code: string, credential: string, action: unknown): Promise<void> {
  const response = await apiFetch(`${base}/api/tables/${code}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
    body: JSON.stringify({ action })
  });
  if (!response.ok) throw new Error(`动作失败（${response.status}）：${await response.text()}`);
}

interface SeatView {
  readonly view: { readonly deal: { readonly dealerSeat: number } | null };
  readonly you: { readonly seat: number } | null;
}

async function viewOf(code: string, credential: string): Promise<SeatView> {
  const response = await apiFetch(`${base}/api/tables/${code}/view`, {
    headers: { authorization: `Bearer ${credential}` }
  });
  if (!response.ok) throw new Error(`取视图失败：${response.status}`);
  return (await response.json()) as SeatView;
}

/* ---------- 截图 ---------- */

interface Shot {
  /** 文件名（不带扩展名） */
  readonly file: string;
  /** 场景说明：打印在结尾的清单里 */
  readonly label: string;
  /** 依次出手的叫品，按叫牌顺序；'pass' 表示不叫。空数组 = 刚发完牌 */
  readonly bids: readonly (string | { readonly points: number; readonly strain: string })[];
  /** 拍第几位叫牌人（0 = 发牌人）—— 恒拍「当前轮到他」的那一位，面板才有候选 */
  readonly captureIndex: 0 | 1 | 2;
  /** 点开之后才有的形态（如展开「▶ 跳叫」） */
  readonly clicks?: readonly string[];
  /** panel = 只拍叫牌面板那一块；viewport = 整屏（给上下文） */
  readonly mode: 'panel' | 'viewport';
  readonly size: { readonly width: number; readonly height: number };
}

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

function sceneFor(captureIndex: 0 | 1 | 2, bids: Shot['bids']): Pick<Shot, 'captureIndex' | 'bids'> {
  return { captureIndex, bids };
}

const SHOTS: readonly Shot[] = [
  {
    file: '01-nobody-bid',
    label: '没人叫：40 全五格 + 整行「▶ 跳叫」',
    ...sceneFor(0, []),
    mode: 'panel',
    size: MOBILE
  },
  {
    file: '02-highest-40h',
    label: '最高 40♥：40 行只亮 ♠ NT（♣♦♥ 隐形占位）+ 45 全行 + 行末「▶ 跳叫」',
    ...sceneFor(1, [{ points: 40, strain: 'H' }]),
    mode: 'panel',
    size: MOBILE
  },
  {
    file: '03-highest-40s',
    label: '最高 40♠：40 行只亮 NT + 45 全行 + 行末「▶ 跳叫」',
    ...sceneFor(2, [{ points: 40, strain: 'H' }, { points: 40, strain: 'S' }]),
    mode: 'panel',
    size: MOBILE
  },
  {
    file: '04-highest-40nt',
    label: '最高 40NT：只给 45 一行 + 整行「▶ 跳叫」（同分已无可压花色）',
    ...sceneFor(2, [{ points: 40, strain: 'C' }, { points: 40, strain: 'NT' }]),
    mode: 'panel',
    size: MOBILE
  },
  {
    file: '05-expanded',
    label: '展开后：40–60 共五档，触发钮消失',
    ...sceneFor(1, [{ points: 40, strain: 'H' }]),
    clicks: ['[data-bid-jump]'],
    mode: 'panel',
    size: MOBILE
  },
  {
    file: '06-desktop-highest-40h',
    label: '同一场景在桌面宽度（sm 断点）下的面板',
    ...sceneFor(1, [{ points: 40, strain: 'H' }]),
    mode: 'panel',
    size: DESKTOP
  },
  {
    file: '07-page-context',
    label: '整屏上下文：手机宽度下的牌桌与面板位置',
    ...sceneFor(0, []),
    mode: 'viewport',
    size: MOBILE
  },
  {
    file: '08-contract-40nt-status',
    label: '成交 40NT 后：状态条与顶部大字都写 NT（无主不再写成「无主」）',
    ...sceneFor(1, [
      { points: 40, strain: 'C' },
      { points: 40, strain: 'NT' },
      'pass',
      'pass'
    ]),
    mode: 'viewport',
    size: MOBILE
  }
];

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function joinTarget(port: number): Promise<{ id: string; wsUrl: string }> {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`开不了新的浏览器页面：${response.status}`);
  const target = (await response.json()) as { id: string; webSocketDebuggerUrl: string };
  return { id: target.id, wsUrl: target.webSocketDebuggerUrl };
}

async function evaluate<T>(cdp: Cdp, expression: string): Promise<T | null> {
  const result = (await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })) as { result?: { value?: T } };
  return result.result?.value ?? null;
}

async function shoot(shot: Shot, port: number, cookie: { code: string; credential: string }): Promise<string> {
  const target = await joinTarget(port);
  const cdp = await connectCdp(target.wsUrl);
  const outPath = join(outDir, `${shot.file}.png`);
  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.setCookie', {
      name: 'sixty_cred',
      value: cookie.credential,
      url: base
    });
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: shot.size.width,
      height: shot.size.height,
      deviceScaleFactor: 2,
      mobile: false
    });
    await cdp.send('Page.navigate', { url: `${base}/table/${cookie.code}` });
    // 等**牌桌页**真的加载完：只等 readyState 会在 navigate 提交之前读到 about:blank 的
    // 'complete'，于是截到一张空白页 —— 所以同时要求路径已经是 /table/<码>。
    await waitFor(
      async () => {
        const state = await evaluate<{ ready: string; path: string }>(
          cdp,
          `({ ready: document.readyState, path: location.pathname })`
        );
        return state !== null && state.ready === 'complete' && state.path.startsWith('/table/');
      },
      '页面加载'
    );
    // SSE 首帧 + 字体就绪：面板的候选档位由服务端首帧就给出，这里只是等排版稳定
    await evaluate(cdp, 'document.fonts ? document.fonts.ready.then(() => true) : true');
    for (const selector of shot.clicks ?? []) {
      const clicked = await evaluate<boolean>(
        cdp,
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`
      );
      if (clicked !== true) throw new Error(`${shot.file}：页面上找不到要点开的东西 ${selector}`);
      await new Promise((r) => setTimeout(r, 350));
    }
    await new Promise((r) => setTimeout(r, 400));

    const box =
      shot.mode === 'panel'
        ? await evaluate<Rect | null>(
            cdp,
            `(() => { const el = document.querySelector('[data-bid-panel]');
               if (!el) return null; const r = el.getBoundingClientRect();
               return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`
          )
        : null;
    if (shot.mode === 'panel' && box === null) {
      throw new Error(`${shot.file}：页面上没有 [data-bid-panel]（不在叫牌阶段，或没轮到他）`);
    }
    const pad = 12;
    const clip =
      box === null
        ? undefined
        : {
            x: Math.max(0, Math.round(box.x - pad)),
            y: Math.max(0, Math.round(box.y - pad)),
            width: Math.round(box.width + pad * 2),
            height: Math.round(box.height + pad * 2),
            scale: 1
          };
    const capture = (await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: box !== null,
      ...(clip === undefined ? {} : { clip })
    })) as { data: string };
    writeFileSync(outPath, Buffer.from(capture.data, 'base64'));
    return outPath;
  } finally {
    cdp.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => undefined);
  }
}

/* ---------- 每个场景：新开一桌，把叫牌推到那一步，再拍 ---------- */

async function runShot(shot: Shot, port: number, stamp: number, index: number): Promise<string> {
  const seats = await Promise.all(
    [0, 1, 2].map((i) => claim(`验收${index}${i}-${stamp}`))
  );
  const created = (await apiFetch(`${base}/api/tables`, {
    method: 'POST',
    headers: { authorization: `Bearer ${seats[0]!.credential}` }
  }).then((r) => r.json())) as { code: string };
  const code = created.code;
  for (const seat of seats.slice(1)) {
    const response = await apiFetch(`${base}/api/tables/${code}/join`, {
      method: 'POST',
      headers: { authorization: `Bearer ${seat.credential}` }
    });
    if (!response.ok) throw new Error(`入座失败：${response.status}`);
  }
  await act(code, seats[0]!.credential, { type: 'deal' });

  // 叫牌顺序：发牌人起顺时针 —— 从视图里取，首副发牌人是随机的
  const dealer = (await viewOf(code, seats[0]!.credential)).view.deal?.dealerSeat ?? 0;
  const order = [0, 1, 2].map((step) => seats[(dealer + step) % 3]!);

  for (let i = 0; i < shot.bids.length; i += 1) {
    const call = shot.bids[i]!;
    // 叫牌严格按座位轮转，超过三个人就绕回第一位（成交前那一轮 pass 会绕回来）
    await act(code, order[i % 3]!.credential, { type: 'bid', call });
  }
  const actor = order[shot.captureIndex]!;
  return await shoot(shot, port, { code, credential: actor.credential });
}

async function main(): Promise<void> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const server = await startServer();
  const chrome = await startChrome();
  const stamp = Date.now() % 100000;
  const written: { file: string; label: string }[] = [];
  try {
    for (const [index, shot] of SHOTS.entries()) {
      const path = await runShot(shot, chrome.port, stamp, index);
      written.push({ file: path, label: shot.label });
      console.log(`✔ ${shot.file}.png  ${shot.label}`);
    }
  } finally {
    chrome.process.kill();
    server.process?.kill();
  }
  console.log(`\n共 ${written.length} 张，写在 ${outDir}`);
  for (const item of written) console.log(` - ${item.file}`);
}

await main();
