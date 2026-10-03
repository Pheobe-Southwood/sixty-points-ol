<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import { BID_GLYPH, bidCandidates, bidText, highestCall, isRedStrain, whoLabel } from '$lib/labels';

  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const mySeat = $derived(view?.you.seat ?? 0);
  const names = $derived((client.table?.seats ?? []).map((seat) => seat.name));
  const myTurn = $derived(deal !== null && deal.phase === 'auction' && deal.auctionTurn === mySeat);
  const rows = $derived(view === null ? [] : bidCandidates(view));
  /** 顶部大字显示的是**最高叫品**（将要成为定约的那个）；「不叫」只进历史 */
  const top = $derived(view === null ? null : highestCall(view));
  const turnName = $derived(deal === null ? '' : whoLabel(names, mySeat, deal.auctionTurn));
</script>

<!-- 面板必须有界：叫牌可以一直抬价，历史与候选行都会无上限变长。
     没有 max-h 时面板会往毡面外长，而 main 是 overflow-hidden ——
     「不叫」就被裁到屏幕外、点不到了。这里：历史段自己滚，候选区自己滚，
     「不叫」固定在最后一行，任何轮数、任何视口高度都在。 -->
<section
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
        {myTurn ? '轮到你' : `${turnName} 叫牌中`}
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
</section>
