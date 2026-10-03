/**
 * 阶段说明单测：界面上不再有常驻提示，说明只活在「?」弹层与 /rules 里，
 * 所以这份文本必须①每个阶段都有、②写完整、③不再出现方位称谓、
 * ④anchor 指向的 /rules 小节真实存在（对着页面文件核对，而不是各写一份常量）。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { helpKeyOf, phaseHelp, type HelpContext, type HelpKey } from '../src/lib/help.ts';

const ALL_KEYS: readonly HelpKey[] = [
  'lobby',
  'auction',
  'bury-declarer',
  'bury-defender',
  'play-lead',
  'play-follow',
  'play-wait',
  'scored'
];

/** 每个阶段必须讲到的关键词：漏了就是「说不完整」 */
const REQUIRED: Record<HelpKey, readonly string[]> = {
  lobby: ['三人', '开始第一副', '邀请', '17', '暗底'],
  auction: ['40', '加 5 分', '♣ < ♦ < ♥ < ♠ < 无主', '两家不叫', '庄家', '级牌', '认领责任'],
  'bury-declarer': ['3 张', '保底', '抠底', '末轮张数'],
  'bury-defender': ['暗底', '闲家', '底分'],
  'play-lead': ['单张', '顺子', '跳过级牌', '跟几张'],
  'play-follow': ['同门', '同张数', '结构优先', '杀牌', '垫牌'],
  'play-wait': ['轮到别人', '先出为大', '副级'],
  scored: ['底牌分 × 末轮张数', '40-55', '每多 5 分', 'ceil', '闲家', '冠军']
};

const page = readFileSync(new URL('../src/routes/rules/+page.svelte', import.meta.url), 'utf8');
const tryPlay = readFileSync(new URL('../src/lib/components/TryPlay.svelte', import.meta.url), 'utf8');

/** 取某个小节自己的源码片段：断言必须落在小节内，否则「别处也提过一句」会让守卫变成空转 */
function sectionOf(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) throw new Error(`找不到小节 ${id}`);
  const next = html.indexOf('<section', start);
  return html.slice(start, next < 0 ? html.length : next);
}

test('每个阶段都有标题、至少两条正文，且逐条非空', () => {
  for (const key of ALL_KEYS) {
    const entry = phaseHelp(key);
    assert.ok(entry.title.length > 0, `${key} 缺标题`);
    assert.ok(entry.body.length >= 2, `${key} 正文少于两条`);
    for (const item of entry.body) {
      assert.ok(item.trim().length >= 8, `${key} 有一条过短：${item}`);
    }
  }
});

test('每个阶段都把话说完整（关键词齐备）', () => {
  for (const key of ALL_KEYS) {
    const text = phaseHelp(key).body.join('\n');
    for (const keyword of REQUIRED[key]) {
      assert.ok(text.includes(keyword), `${key} 的说明缺少「${keyword}」`);
    }
  }
});

test('说明里不再出现方位称谓（东/南/西）', () => {
  for (const key of ALL_KEYS) {
    const entry = phaseHelp(key);
    const text = [entry.title, ...entry.body].join('\n');
    assert.equal(/[东南西]/.test(text), false, `${key} 仍出现方位称谓：${text}`);
  }
});

test('anchor 指向 /rules 里真实存在的小节', () => {
  for (const key of ALL_KEYS) {
    const { anchor } = phaseHelp(key);
    assert.ok(page.includes(`id="${anchor}"`), `/rules 缺少 id="${anchor}"（${key} 的链接会落空）`);
  }
});

test('/rules 的九个小节都在，且不只是空壳', () => {
  for (const id of ['start', 'basics', 'trump', 'auction', 'bury', 'play', 'inference', 'scoring', 'levels']) {
    assert.ok(page.includes(`id="${id}"`), `/rules 缺小节 ${id}`);
  }
  // 教程必须复用真实牌渲染组件，而不是自己画方块
  for (const component of ["components/Card.svelte", "components/HandFan.svelte", "components/LevelBadge.svelte"]) {
    assert.ok(page.includes(component), `/rules 没有复用 ${component}`);
  }
});

test('不同阶段的内容确实不同（防空转）', () => {
  const seen = new Map<string, HelpKey>();
  for (const key of ALL_KEYS) {
    const entry = phaseHelp(key);
    const fingerprint = `${entry.title}\n${entry.body.join('\n')}`;
    const previous = seen.get(fingerprint);
    assert.equal(previous, undefined, `${key} 与 ${previous} 的说明完全相同`);
    seen.set(fingerprint, key);
  }
  assert.equal(seen.size, ALL_KEYS.length);
});

test('helpKeyOf 覆盖全部八种状态且都能落到具体某段', () => {
  const cases: readonly [HelpContext, HelpKey][] = [
    [{ phase: 'lobby' }, 'lobby'],
    [{ phase: 'auction' }, 'auction'],
    [{ phase: 'bury', isDeclarer: true }, 'bury-declarer'],
    [{ phase: 'bury', isDeclarer: false }, 'bury-defender'],
    [{ phase: 'bury' }, 'bury-defender'],
    [{ phase: 'play', myTurn: false }, 'play-wait'],
    [{ phase: 'play', myTurn: true, leading: true }, 'play-lead'],
    [{ phase: 'play', myTurn: true, leading: false }, 'play-follow'],
    [{ phase: 'play', myTurn: true }, 'play-follow'],
    [{ phase: 'scored' }, 'scored']
  ];
  const reached = new Set<HelpKey>();
  for (const [context, expected] of cases) {
    const key = helpKeyOf(context);
    assert.equal(key, expected, `${JSON.stringify(context)} 应为 ${expected}`);
    reached.add(key);
  }
  assert.deepEqual([...reached].sort(), [...ALL_KEYS].sort(), 'helpKeyOf 没能覆盖全部阶段');
});

test('教程：每个依赖级牌的示例都点明了将牌环境', () => {
  // 级牌点数必须在讲它的那一节里写出来，不能只在别处顺带提过一句
  const trumpSection = sectionOf(page, 'trump');
  assert.ok(
    /级牌[^。]*?<b[^>]*>5<\/b>/.test(trumpSection),
    '#trump 小节没有在「级牌」那句话里写明点数是 5'
  );
  assert.ok(trumpSection.includes('本副：'), '#trump 小节的牌面示例没有带将牌环境说明');

  // 打牌推论里 ①②③⑥ 都依赖级牌，每块都要自带「本副：」
  const inference = sectionOf(page, 'inference');
  assert.ok(inference.includes('级牌 5'), '打牌推论没有在示例里写明级牌是 5');
  const envCount = (inference.match(/本副：/g) ?? []).length;
  assert.ok(envCount >= 4, `打牌推论里只有 ${envCount} 处将牌环境说明，依赖级牌的示例块应各自带一句`);

  // 练手题与埋底手牌通过组件渲染将牌环境，组分件里必须真的输出这句
  assert.ok(tryPlay.includes('本副：') && tryPlay.includes('trumpText(trump)'), 'TryPlay 没有渲染将牌环境');
  const playSection = sectionOf(page, 'play');
  assert.ok((playSection.match(/TryPlay/g) ?? []).length >= 3, '打牌一节的练手题没有走 TryPlay 组件');
  assert.ok(sectionOf(page, 'bury').includes('本副：'), '埋底一节的手牌示意没有带将牌环境说明');
});

test('教程：升级表只用可达分数，不再出现 59 / 69 / 79 / 89 这类边界', () => {
  assert.equal(/4[0-9]\s*-\s*59/.test(page), false, '教程仍在用 40-59 这种不可达区间');
  assert.equal(/6[0-9]\s*-\s*69/.test(page), false);
  assert.equal(/7[0-9]\s*-\s*79/.test(page), false);
  assert.equal(/8[0-9]\s*-\s*89/.test(page), false);
  assert.ok(page.includes('UPGRADE_ROWS'), '升级表没有走 scenarios 的可达区间数据');
  assert.ok(page.includes('DEFENDER_STEPS'), '闲家升级档位没有走 scenarios 数据');
  assert.ok(page.includes('LEVEL_STEPS'), '升级步进示例没有走 scenarios 数据');
  assert.ok(page.includes('得分只会是 5 的倍数') || page.includes('只会是 5 的倍数'), '没有解释为什么边界不可达');
  assert.ok(page.includes('只看实际'), '没有讲明升级只看实际得分、与叫分无关');
});

test('教程：叫牌一节有阻击叫的心理博弈，且门槛算式是修正过的', () => {
  assert.ok(page.includes('阻击'), '教程没有讲阻击叫');
  assert.ok(page.includes('认领责任'), '教程没有点出「叫牌是认领责任」');
  assert.ok(page.includes('藏牌'), '教程没有讲「先 pass 再叫」');
  // 旧说法：闲家合计抓到 100 − 45 = 55 分就把他打输（漏掉底牌分）
  // 现在这个数字只允许以「不是简单的…」这种被否定的形式出现，且旧结论句必须消失
  assert.equal(/闲家合计抓到[^。]*就把他打输/.test(page), false, '仍在用漏掉底牌的旧结论');
  if (page.includes('100 − 45 = 55')) {
    assert.ok(page.includes('不是简单的「100 − 45 = 55」'), '100 − 45 只能作为「被否定的错误说法」出现');
  }
  assert.ok(page.includes('settle.protectBar') && page.includes('settle.digBar'), '门槛数值不是算出来的');
  assert.ok(page.includes('AUCTION_INTENTS'), '叫法意图表没有走 scenarios 数据');
});
