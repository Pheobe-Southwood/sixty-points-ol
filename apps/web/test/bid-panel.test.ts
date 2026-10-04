/**
 * 叫牌面板可达性的**源码**守卫（进 CI 的 `pnpm test:web`）。
 *
 * 回归的是 f40bad9 那次没修成的修复：它给面板加上了 `max-h-[56%]`，面板却仍是
 * flex 列 + `overflow-hidden`，候选区仍是 `shrink-0 max-h-44`。手机上面板可用高度
 * ~240px、固定开销 ~344px，唯一可压缩的历史区被压到 0 之后，差额由 `overflow-hidden`
 * 从底部裁掉 —— 裁掉的正是排在最后的「不叫」，而且它不在任何滚动区里，滚也滚不回来。
 * 那次同时加的 ui-check 守卫只断言「页面里有 max-h-[56%] 与 overflow-y-auto」，
 * 两个类一直都在，所以它对这次故障完全瞎。
 *
 * 这里两步：1) 现在的 BidPanel 必须满足不变式；2) 把旧形状与两个近似形状喂进同一个
 * 判断，必须被判为不可达 —— 守卫不空转的常驻证据（判断逻辑在 src/lib/panel-guard.ts，
 * ui-check 对出货 HTML 用的是同一份）。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { checkBidPanelReachability } from '../src/lib/panel-guard.ts';

const source = readFileSync(new URL('../src/lib/components/BidPanel.svelte', import.meta.url), 'utf8');

test('叫牌面板自己滚、「不叫」是 sticky 底部页脚', () => {
  const result = checkBidPanelReachability(source);
  assert.equal(result.ok, true, `面板可达性守卫没过：${result.reason}`);
});

/**
 * 面板里唯一的外部内容块是叫牌记录（`AuctionRecord`，毡面与抽屉共用一份）。
 * `checkBidPanelReachability` 只审 `BidPanel.svelte` 这一个文件的 `<section>` ——
 * 记录里一旦又长出滚动区，上面的守卫照样绿，而 CI 只跑 `pnpm test:web`（不跑 ui-check，
 * 那条要起服务端）。所以那条「面板里不许有第二处 overflow」的不变式，得在记录这一侧也钉一下。
 */
const record = readFileSync(new URL('../src/lib/components/AuctionRecord.svelte', import.meta.url), 'utf8');

test('叫牌记录本身不自带滚动区（面板里不许有第二个 overflow）', () => {
  const code = record.replace(/<!--[\s\S]*?-->/g, '');
  const found = code.match(/overflow-(?:y-auto|hidden)/g) ?? [];
  assert.equal(
    found.length,
    0,
    `AuctionRecord 里出现了 ${found.join('、')}：面板「唯一滚动区」这条不变式断在这里，` +
      '而源码守卫只看 BidPanel.svelte 的 section，看不见这个文件'
  );
});

/**
 * f40bad9（= 修复前 HEAD）的 `<section>` 逐字抄本。两处必要改动：
 * 1. 补上 `data-bid-panel="true"` —— 这次新引入的定位钩子，不补守卫连面板都找不到；
 *    除此之外每个 class 都与那个 commit 一模一样。
 * 2. 源码里那处 JS 模板字面量写成 `\`\${turnName}\``，否则外层模板字面量会自己插值。
 *
 * 刻意不写进 fixture 文件、也不在测试里跑 `git show`：CI 是浅克隆，取不到这个 commit，
 * 反证就成了「有时红有时绿」。抄本配合下面那条断言，跑在任何机器上都一样。
 */
const OLD_PANEL = `<section
  data-bid-panel="true"
  class="absolute inset-x-3 top-[22%] flex max-h-[56%] flex-col overflow-hidden rounded-2xl bg-black/55 p-4 ring-1 ring-white/10 backdrop-blur-sm sm:inset-x-0 sm:top-1/2 sm:mx-auto sm:max-h-[74%] sm:w-[22rem] sm:-translate-y-1/2 sm:p-5"
>
  <div class="flex shrink-0 items-baseline justify-between">
    <h2 class="text-sm font-bold">叫牌</h2>
    <span class="text-[11px] text-white/45">
      第 {deal?.dealNo ?? 1} 副 · {whoLabel(names, mySeat, deal?.dealerSeat ?? 0)} 发牌
    </span>
  </div>

  <!-- 大字：最后一次有效叫品 -->
  <div class="mt-2 flex shrink-0 items-baseline justify-between gap-2">
    {#if top === null}
      <span class="text-2xl font-black tracking-wide text-white/35">还没人叫</span>
    {:else}
      <span class="text-3xl font-black leading-none tracking-wide tabular-nums text-gold">
        {top.points}<span class={isRedStrain(top.strain) ? 'text-rose-300' : ''}>{BID_GLYPH[top.strain]}</span>
      </span>
    {/if}
    {#if deal !== null}
      <span
        class={[
          'shrink-0 rounded-md px-2 py-1 text-[11px]',
          myTurn ? 'bg-gold/25 ring-1 ring-gold/40' : 'bg-white/10 text-white/55'
        ]}
      >
        {myTurn ? '轮到你' : \`\${turnName} 叫牌中\`}
      </span>
    {/if}
  </div>

  <!-- 历史：自己滚，不再把下面的按钮顶出去 -->
  <div class="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <div class="flex flex-wrap gap-1.5 text-[11px]">
      {#each deal?.auction ?? [] as entry, index (index)}
        <span class="rounded-md bg-white/10 px-2 py-1">
          <span class="text-white/50">{whoLabel(names, mySeat, entry.seat)}</span>
          {bidText(entry.call)}
        </span>
      {/each}
    </div>
  </div>

  {#if myTurn}
    <!-- 候选区也自己滚：「不叫」固定在它下面 -->
    <div class="mt-3 max-h-44 shrink-0 space-y-1.5 overflow-y-auto overscroll-contain sm:max-h-56">
      {#each rows as row (row.points)}
        <div class="flex items-center gap-1.5">
          <span class="w-7 shrink-0 text-right text-xs tabular-nums text-white/55">{row.points}</span>
          {#each row.strains as strain (strain)}
            <button
              type="button"
              class={['bidbtn rounded-lg bg-white/10 px-2.5 py-1.5 text-[13px] hover:bg-white/20',
                isRedStrain(strain) && 'text-rose-300']}
              disabled={client.busy}
              onclick={() => void client.bid({ points: row.points, strain })}
            >
              {BID_GLYPH[strain]}
            </button>
          {/each}
        </div>
      {/each}
    </div>
    <button
      type="button"
      class="mt-2 shrink-0 rounded-lg border border-white/25 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-40"
      disabled={client.busy}
      onclick={() => void client.bid('pass')}
    >
      不叫
    </button>
  {/if}
</section>`;

/** 面板自己滚、但「不叫」还是普通文档流里的按钮：滚到底也不保证看得到 */
const NO_STICKY = `<section data-bid-panel="true" class="max-h-[56%] overflow-y-auto">
  <button type="button" class="mt-2 w-full rounded-lg border border-white/25 px-4 py-2 text-sm">不叫</button>
</section>`;

/** 面板自己滚，但候选区又各自带一个固定高度的滚动块：固定开销照样能把按钮顶出去 */
const NESTED_SCROLL = `<section data-bid-panel="true" class="max-h-[56%] overflow-y-auto">
  <div class="mt-3 min-h-0 flex-1 overflow-y-auto">历史</div>
  <div class="mt-3 max-h-44 shrink-0 overflow-y-auto">候选</div>
  <button type="button" class="sticky bottom-4 min-h-11 w-full">不叫</button>
</section>`;

test('反证：f40bad9 的旧形状必须被判为不可达（它用 overflow-hidden 裁掉了「不叫」）', () => {
  const result = checkBidPanelReachability(OLD_PANEL);
  assert.equal(result.ok, false, '旧形状被判为通过：守卫是空转的');
  assert.match(result.reason, /overflow-hidden/);
});

test('反证：面板内还有第二个滚动块时，守卫必须点出它', () => {
  const result = checkBidPanelReachability(NESTED_SCROLL);
  assert.equal(result.ok, false, '面板内出现第二个滚动块却判为通过');
  assert.match(result.reason, /第二个滚动/);
});

test('反证：不是 sticky 底部的「不叫」必须被判为不可达', () => {
  const result = checkBidPanelReachability(NO_STICKY);
  assert.equal(result.ok, false, '非 sticky 的「不叫」被判为通过');
  assert.match(result.reason, /sticky/);
});

test('观战者/非本家轮次的页面：没有「不叫」按钮也要能单独校验面板本身', () => {
  const withoutButton = NO_STICKY.replace(/\s*<button[\s\S]*?<\/button>/, '');
  assert.equal(checkBidPanelReachability(withoutButton).ok, false, '默认口径下缺按钮就该红');
  assert.equal(
    checkBidPanelReachability(withoutButton, { requirePassButton: false }).ok,
    true,
    'requirePassButton:false 时应只看面板本身（ui-check 在没轮到的页面上用这一档）'
  );
});
