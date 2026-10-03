<script lang="ts">
  import type { Strain } from '@sixty/engine';
  import type { TableClient } from '$lib/client/table.svelte';
  import { bidCandidates, callText, seatLabel } from '$lib/labels';

  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const myTurn = $derived(
    view !== null && deal !== null && deal.phase === 'auction' && deal.auctionTurn === view.you.seat
  );
  const rows = $derived(view === null ? [] : bidCandidates(view));
  const turnSeat = $derived(deal?.auctionTurn ?? 0);

  const glyph: Record<Strain, string> = { C: '♣', D: '♦', H: '♥', S: '♠', NT: '无主' };
  const redStrain = (strain: Strain): boolean => strain === 'H' || strain === 'D';
</script>

<section
  class="absolute inset-x-0 top-[30%] mx-auto w-[21rem] max-w-[92%] rounded-2xl bg-black/40 p-4 ring-1 ring-white/10 backdrop-blur-sm sm:top-1/2 sm:-translate-y-1/2 sm:p-5"
>
  <div class="flex items-baseline justify-between">
    <h2 class="text-sm font-bold">叫牌</h2>
    <span class="text-[11px] text-white/45">
      第 {deal?.dealNo ?? 1} 副 · {seatLabel(deal?.dealerSeat ?? 0)}家发牌
    </span>
  </div>

  <div class="mt-3 flex flex-wrap gap-1.5 text-[11px]">
    {#each deal?.auction ?? [] as entry, index (index)}
      <span class="rounded-md bg-white/10 px-2 py-1">
        <span class="text-white/50">{seatLabel(entry.seat)}</span>
        {callText(entry.call)}
      </span>
    {/each}
    {#if myTurn}
      <span class="rounded-md bg-gold/25 px-2 py-1 ring-1 ring-gold/40">轮到你</span>
    {:else}
      <span class="rounded-md bg-white/10 px-2 py-1 text-white/60">
        等待 {seatLabel(turnSeat)}家叫牌…
      </span>
    {/if}
  </div>

  {#if myTurn}
    <div class="mt-4 space-y-1.5">
      {#each rows as row (row.points)}
        <div class="flex items-center gap-1.5">
          <span class="w-7 text-right text-xs tabular-nums text-white/55">{row.points}</span>
          {#each row.strains as strain (strain)}
            <button
              type="button"
              class={['bidbtn rounded-lg bg-white/10 px-2.5 py-1.5 text-[13px] hover:bg-white/20',
                redStrain(strain) && 'text-rose-300']}
              disabled={client.busy}
              onclick={() => void client.bid({ points: row.points, strain })}
            >
              {glyph[strain]}
            </button>
          {/each}
        </div>
      {/each}
      <button
        type="button"
        class="mt-1 rounded-lg border border-white/20 px-4 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
        disabled={client.busy}
        onclick={() => void client.bid('pass')}
      >
        不叫
      </button>
    </div>
  {/if}
</section>
