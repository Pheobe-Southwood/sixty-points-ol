<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import { SPECTATOR_LABEL_SEAT } from '$lib/role';
  import { BID_GLYPH, bidCandidates, bidText, highestCall, isRedStrain, whoLabel } from '$lib/labels';

  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  /** 观战者没有座位（-1）：myTurn 恒为 false，于是只看到叫牌板、没有叫品按钮 */
  const mySeat = $derived(client.you?.seat ?? SPECTATOR_LABEL_SEAT);
  const names = $derived((client.table?.seats ?? []).map((seat) => seat.name));
  const myTurn = $derived(deal !== null && deal.phase === 'auction' && deal.auctionTurn === mySeat);
  const rows = $derived(view === null ? [] : bidCandidates(view));
  /** 顶部大字显示的是**最高叫品**（将要成为定约的那个）；「不叫」只进历史 */
  const top = $derived(view === null ? null : highestCall(view));
  const turnName = $derived(deal === null ? '' : whoLabel(names, mySeat, deal.auctionTurn));
</script>

<!-- 面板自己就是**唯一**的滚动区，「不叫」是它内部的 sticky 页脚。
     上一版反过来做：面板是 flex 列 + overflow-hidden，只靠 max-h 限高。那个形状在手机上
     必然丢掉「不叫」——面板可用高度只有 ~240px（毡面 56%），而它的固定开销（内边距 32 +
     标题 20 + 大字 38 + 候选区 176 + 按钮 46）要 ~344px。唯一可压缩的是历史区，压到 0
     之后差额由 overflow-hidden 从**底部**裁掉，裁掉的正是排在最后的「不叫」；它又不在任何
     滚动区里，滚也滚不回来（60 那一行同样被切掉半截）。
     现在：整块面板滚动（历史与候选行在同一个滚动流里），「不叫」用 sticky bottom-* 贴住
     scrollport 底边 —— 任何视口高度、任何轮数都点得到；sticky 的距离与面板内边距一致，
     所以不滚动时它就在原位，观感与普通底栏一样。
     外层几何（top-[22%] / max-h-[56%]）不动：手机上面板底边已经正好贴着左下「我」座位卡
     的上沿，再抬高就会盖住座位卡。 -->
<section
  data-bid-panel="true"
  class="absolute inset-x-3 top-[22%] max-h-[56%] overflow-y-auto overscroll-contain rounded-2xl bg-black/55 p-4 ring-1 ring-white/10 backdrop-blur-sm sm:inset-x-0 sm:top-1/2 sm:mx-auto sm:max-h-[74%] sm:w-[22rem] sm:-translate-y-1/2 sm:p-5"
>
  <div class="flex items-baseline justify-between">
    <h2 class="text-sm font-bold">叫牌</h2>
    <span class="text-[11px] text-white/45">
      第 {deal?.dealNo ?? 1} 副 · {whoLabel(names, mySeat, deal?.dealerSeat ?? 0)} 发牌
    </span>
  </div>

  <!-- 大字：最高叫品（将成为定约的那个） -->
  <div class="mt-2 flex items-baseline justify-between gap-2">
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
        {myTurn ? '轮到你' : `${turnName} 叫牌中`}
      </span>
    {/if}
  </div>

  <!-- 历史：普通文档流，跟着面板一起滚（不再自己设 max-h，也就不会把下面的按钮顶出去） -->
  <div class="mt-3 flex flex-wrap gap-1.5 text-[11px]">
    {#each deal?.auction ?? [] as entry, index (index)}
      <span class="rounded-md bg-white/10 px-2 py-1">
        <span class="text-white/50">{whoLabel(names, mySeat, entry.seat)}</span>
        {bidText(entry.call)}
      </span>
    {/each}
  </div>

  {#if myTurn}
    <!-- 候选行同样在面板的滚动流里：抬高叫品时整块往下长，滚过去就能点到 -->
    <div class="mt-3 space-y-1.5">
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
    <!-- sticky bottom-4 / sm:bottom-5 对应面板的 p-4 / sm:p-5：贴住底边但不脱出内边距。
         bg-ink/95 是给滚到它下面的内容准备的底：不透明才不会两条字叠在一起。 -->
    <button
      type="button"
      class="sticky bottom-4 mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-white/25 bg-ink/95 px-4 py-2.5 text-sm font-bold text-ivory disabled:opacity-40 sm:bottom-5"
      disabled={client.busy}
      onclick={() => void client.bid('pass')}
    >
      不叫
    </button>
  {/if}
</section>
