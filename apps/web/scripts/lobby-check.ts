/**
 * 开局按钮回归测试：未开局时同桌页必须渲染「开始第一副」按钮，
 * 发牌后必须切换到牌局界面（这正是 API 冒烟盖不到的 UI 缺口）。
 * 运行：BASE=http://127.0.0.1:5178 node scripts/lobby-check.ts
 */
const BASE = process.env['BASE'] ?? 'http://127.0.0.1:5178';

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

/** 取出包含指定文案的 <button> 开标签，并判断它是否真的带 disabled 属性 */
function buttonTagAround(html: string, label: string): string {
  const index = html.indexOf(label);
  if (index < 0) throw new Error(`页面里找不到「${label}」`);
  const open = html.lastIndexOf('<button', index);
  if (open < 0) throw new Error(`「${label}」不在 <button> 里`);
  return html.slice(open, html.indexOf('>', open) + 1);
}

/** 只看属性：`disabled:opacity-40` 这类 Tailwind 类名不算 */
function hasDisabledAttr(tag: string): boolean {
  return /\sdisabled(?=[\s=/>])/.test(tag);
}

async function main(): Promise<void> {
  const stamp = Date.now() % 100000;
  const players = await Promise.all([0, 1, 2].map((i) => claim(`开局${i}-${stamp}`)));

  const created = (await fetch(`${BASE}/api/tables`, {
    method: 'POST',
    headers: { authorization: `Bearer ${players[0]!.credential}` }
  }).then((r) => r.json())) as { code: string };
  const code = created.code;

  for (const player of players.slice(1)) {
    const response = await fetch(`${BASE}/api/tables/${code}/join`, {
      method: 'POST',
      headers: { authorization: `Bearer ${player.credential}` }
    });
    assert(response.ok, `入座失败：${response.status}`);
  }

  // 1) 三人已入座、尚未发牌：页面必须有开始按钮且可点（不是 disabled）
  const lobby = await page(`/table/${code}`, players[0]!.credential);
  assert(lobby.includes('开始第一副'), '未开局页面没有渲染「开始第一副」按钮（回归！）');
  const startTag = buttonTagAround(lobby, '开始第一副');
  assert(!hasDisabledAttr(startTag), `三人到齐时开始按钮仍是 disabled：${startTag}`);
  // 入座进度不再单独占一行（与座位 chip、按钮文案重复三遍）：
  // 直接断言三个座位都列了出来，名字就是玩家名（界面上不再有方位称谓）
  for (const player of players) {
    assert(lobby.includes(player.name), `未开局页面没有列出在座玩家 ${player.name}`);
  }
  assert(!/[东南西]家/.test(lobby), '未开局页面仍出现方位称谓');
  console.log('未开局页面：开始按钮已渲染且可点，三个座位都列出了玩家名');

  // 2) 发牌后页面应切换成牌局界面，且不再出现开始按钮
  const dealt = await fetch(`${BASE}/api/tables/${code}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${players[0]!.credential}` },
    body: JSON.stringify({ action: { type: 'deal' } })
  });
  assert(dealt.ok, `发牌失败：${dealt.status}`);
  const playing = await page(`/table/${code}`, players[0]!.credential);
  assert(playing.includes('叫牌'), '发牌后页面没有进入叫牌界面');
  assert(!playing.includes('开始第一副'), '发牌后仍显示开始按钮');
  console.log('发牌后页面：已进入叫牌界面');

  console.log('LOBBY OK');
}

main().catch((error: unknown) => {
  console.error('LOBBY FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
