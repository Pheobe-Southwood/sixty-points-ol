/**
 * 开局入口回归测试：未开局时同桌页必须渲染「开始第一副」按钮，
 * 发牌后必须切换到牌局界面（这正是 API 冒烟盖不到的 UI 缺口）；
 * 另外守「未注册点邀请链接」这条路：邀请码必须被带进大厅，注册后直接回到原桌。
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

/** 不带凭据访问，只看重定向（手动跟随，否则 fetch 会替我们跳掉） */
async function redirectOf(path: string): Promise<{ status: number; location: string }> {
  const response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  return { status: response.status, location: response.headers.get('location') ?? '' };
}

async function pageAnonymous(path: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`);
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

  // 3) 未注册时点邀请链接：邀请码必须被带进大厅（曾经被 redirect('/') 丢掉，用户得重新点一次链接）
  const bounced = await redirectOf(`/table/${code}`);
  assert(bounced.status === 307, `未注册访问同桌页应 307 跳大厅，实际 ${bounced.status}`);
  assert(
    bounced.location.endsWith(`/?join=${code}`),
    `未注册跳大厅时邀请码被丢了：location=${bounced.location}（期望以 /?join=${code} 结尾）`
  );
  const entry = await pageAnonymous(`/?join=${code}`);
  assert(entry.includes(code), '大厅没有把邀请码带进入座框，注册后回不到原桌');
  assert(entry.includes('回到同桌'), '大厅没有告诉用户注册后会自动回到原桌');

  // 邀请码不合法的路径不该把垃圾带进大厅（也不该变成任意外链）
  const garbage = await redirectOf('/table/zz');
  assert(!garbage.location.includes('join='), `无效邀请码不该被带进大厅：${garbage.location}`);

  // 补一个身份后，带着同一个邀请码就能直接回到房间里
  const latecomer = await claim(`迟到-${stamp}`);
  const rejoin = await page(`/table/${code}`, latecomer.credential);
  assert(rejoin.includes('观战中'), '注册后带着邀请码没有回到同桌页（满座时应以观战身份进入）');
  console.log('未注册点链接：邀请码带进大厅，注册后直接回到原桌；无效邀请码不会被带过去');

  console.log('LOBBY OK');
}

main().catch((error: unknown) => {
  console.error('LOBBY FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
