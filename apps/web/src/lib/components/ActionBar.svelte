<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import { seatLabel } from '$lib/labels';

  let {
    client,
    summaryOpen = false,
    onToggleSummary
  }: { client: TableClient; summaryOpen?: boolean; onToggleSummary?: () => void } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const summary = $derived(deal?.summary ?? null);
  const finished = $derived(view?.status === 'finished');
  const phase = $derived(deal?.phase ?? null);
  const selectedCount = $derived(client.selected.length);
  const myTurn = $derived(
    view !== null && deal !== null && deal.phase === 'play' && deal.playTurn === view.you.seat
  );
  const isLeader = $derived(deal !== null && deal.trick !== null && deal.trick.plays.length === 0);

  const gold = 'rounded-lg bg-gold px-4 py-1.5 text-xs font-bold text-ink transition enabled:hover:brightness-110 disabled:opacity-30';
  const ghost = 'rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30';
</script>

<div class="flex min-h-[2.6rem] flex-wrap items-center gap-2 py-1.5">
  {#if view === null}
    <span class="text-xs text-white/45">三人到齐后，任意一人点「开始第一副」。</span>
  {:else if phase === 'auction'}
    <span class="text-xs text-white/45">40 起步、步长 5；同分需花色更高。结合手牌选择叫品，也可以不叫。</span>
  {:else if phase === 'bury'}
    {#if view.you.isDeclarer}
      <span class="text-xs text-white/70">
        已选 <b class="tabular-nums text-gold">{selectedCount}</b> / 3 张入底
      </span>
      <button type="button" class={gold} disabled={selectedCount !== 3 || client.busy} onclick={() => void client.bury()}>
        确认埋底
      </button>
    {:else}
      <span class="text-xs text-white/45">等待 {seatLabel(deal?.declarerSeat ?? 0)}家埋底…</span>
    {/if}
  {:else if phase === 'play'}
    {#if myTurn}
      <span class="text-xs text-white/70">
        {isLeader ? '你领出：单张或同门顺子' : '请跟牌：同门同张数，结构优先'} · 已选
        <b class="tabular-nums text-gold">{selectedCount}</b> 张
      </span>
      <button
        type="button"
        class={gold}
        disabled={selectedCount === 0 || client.playError !== null || client.busy}
        onclick={() => void client.play()}
      >
        出 牌
      </button>
      <button type="button" class={ghost} disabled={selectedCount === 0} onclick={() => client.clearSelection()}>
        清空
      </button>
      {#if client.playError}
        <span class="text-xs text-red-300">{client.playError}</span>
      {/if}
    {:else}
      <span class="text-xs text-white/45">
        等待 {seatLabel(deal?.playTurn ?? 0)}家出牌…（{deal?.handCounts[deal.playTurn ?? 0] ?? 0} 张手牌）
      </span>
    {/if}
  {:else if phase === 'scored'}
    <span class="text-xs text-white/70">
      本副结束 · {summary?.made ? '打成' : '打输'}（最终
      <b class="tabular-nums text-gold">{summary?.finalScore ?? 0}</b> 分 / 需 {summary?.contract.points ?? 0}）
    </span>
    <button
      type="button"
      class="rounded-lg border border-gold/50 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/10"
      onclick={() => onToggleSummary?.()}
    >
      {summaryOpen ? '收起结算' : '结算详情'}
    </button>
    {#if finished}
      <button type="button" class={gold} disabled={client.busy} onclick={() => void client.newGame()}>
        开新对局（级别重置）
      </button>
    {:else}
      <button type="button" class={gold} disabled={client.busy} onclick={() => void client.deal()}>
        下一副（{seatLabel((view.dealerSeat + 1) % 3)}家发牌）
      </button>
    {/if}
  {/if}
</div>
