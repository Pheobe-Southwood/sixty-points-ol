<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import { helpKeyOf, phaseHelp } from '$lib/help';
  import { whoLabel } from '$lib/labels';
  import HelpPopover from './HelpPopover.svelte';

  let {
    client,
    summaryOpen = false,
    onToggleSummary
  }: { client: TableClient; summaryOpen?: boolean; onToggleSummary?: () => void } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const finished = $derived(view?.status === 'finished');
  const phase = $derived(deal?.phase ?? null);
  const selectedCount = $derived(client.selected.length);
  const mySeat = $derived(view?.you.seat ?? 0);
  const names = $derived((client.table?.seats ?? []).map((seat) => seat.name));

  const myTurn = $derived(deal !== null && deal.phase === 'play' && deal.playTurn === mySeat);

  const help = $derived(
    phaseHelp(
      helpKeyOf({
        phase: phase ?? 'lobby',
        isDeclarer: view?.you.isDeclarer ?? false,
        myTurn,
        leading: deal !== null && deal.trick !== null && deal.trick.plays.length === 0
      })
    )
  );

  /**
   * 界面上唯一一行实时状态：只说「谁在动、还剩几张」，不含任何操作指引。
   * 轮到自己时返回 null——按钮和已选张数已经说清楚了，再说一遍就是重复。
   */
  const status = $derived.by(() => {
    if (view === null || deal === null) return null;
    if (deal.phase === 'auction') {
      return deal.auctionTurn === mySeat ? null : `${whoLabel(names, mySeat, deal.auctionTurn)} 叫牌中`;
    }
    if (deal.phase === 'bury') {
      const seat = deal.declarerSeat;
      return seat === null || seat === mySeat ? null : `${whoLabel(names, mySeat, seat)} 埋底中`;
    }
    if (deal.phase === 'play') {
      const turn = deal.playTurn;
      if (turn === null || turn === mySeat) return null;
      return `${whoLabel(names, mySeat, turn)} 出牌中 · 剩 ${deal.handCounts[turn] ?? 0} 张`;
    }
    return null;
  });

  const gold =
    'rounded-lg bg-gold px-4 py-1.5 text-xs font-bold text-ink transition enabled:hover:brightness-110 disabled:opacity-30';
  const ghost = 'rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30';
</script>

<div class="flex min-h-[2.6rem] flex-wrap items-center gap-2 py-1.5">
  <!-- 阶段说明只活在这里：所有常驻提示文案都已删除，正文与 /rules 教程同源 -->
  <HelpPopover align="left" placement="up" title={help.title} label="?">
    <ul class="list-disc space-y-1.5 pl-4">
      {#each help.body as line (line)}
        <li>{line}</li>
      {/each}
    </ul>
    <a class="mt-3 inline-block text-[11px] font-semibold text-gold hover:underline" href={`/rules#${help.anchor}`}>
      完整新手教程 →
    </a>
  </HelpPopover>

  {#if status}
    <span class="text-xs text-white/45">{status}</span>
  {/if}

  {#if phase === 'bury' && view?.you.isDeclarer}
    <span class="text-xs text-white/70">
      已选 <b class="tabular-nums text-gold">{selectedCount}</b> / 3 张入底
    </span>
    <button type="button" class={gold} disabled={selectedCount !== 3 || client.busy} onclick={() => void client.bury()}>
      确认埋底
    </button>
  {:else if phase === 'play' && myTurn}
    <span class="text-xs text-white/70">已选 <b class="tabular-nums text-gold">{selectedCount}</b> 张</span>
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
  {:else if phase === 'scored'}
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
      <button type="button" class={gold} disabled={client.busy} onclick={() => void client.deal()}>下一副</button>
    {/if}
  {/if}
</div>
