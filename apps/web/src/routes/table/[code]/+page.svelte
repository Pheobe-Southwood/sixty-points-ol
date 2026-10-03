<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { cardKey, START_LEVEL, type Level } from '@sixty/engine';
  import { TableClient } from '$lib/client/table.svelte';
  import ActionBar from '$lib/components/ActionBar.svelte';
  import BidPanel from '$lib/components/BidPanel.svelte';
  import BuryPanel from '$lib/components/BuryPanel.svelte';
  import DealSummary from '$lib/components/DealSummary.svelte';
  import HandFan from '$lib/components/HandFan.svelte';
  import HistoryList from '$lib/components/HistoryList.svelte';
  import InviteCode from '$lib/components/InviteCode.svelte';
  import LobbyPanel from '$lib/components/LobbyPanel.svelte';
  import SeatCard from '$lib/components/SeatCard.svelte';
  import TableStatus from '$lib/components/TableStatus.svelte';
  import TrickArea from '$lib/components/TrickArea.svelte';
  import { kittyHandDelta } from '$lib/labels';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // 只取首次 SSR 数据构造客户端状态，不随后续 data 变化重建
  const client = untrack(() => new TableClient(data.code, { view: data.view, table: data.table }));

  let historyOpen = $state(false);
  let summaryOpen = $state(false);
  let openedFor = -1; // 非响应式：仅用于「每副只自动弹出一次结算」

  onMount(() => {
    client.connect();
    return () => client.disconnect();
  });

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const summary = $derived(deal?.summary ?? null);
  const trump = $derived(deal?.trump ?? null);
  /** 文本里一律用玩家名指代（不再有东/南/西）：座位卡显示的就是这些名字 */
  const names = $derived((client.table?.seats ?? []).map((seat) => seat.name));

  const leftSeat = $derived((data.seat + 1) % 3);
  const rightSeat = $derived((data.seat + 2) % 3);

  const selectable = $derived(
    view !== null &&
      deal !== null &&
      ((deal.phase === 'play' && deal.playTurn === data.seat) ||
        (deal.phase === 'bury' && view.you.isDeclarer))
  );

  /** 埋底阶段给庄家的手牌标出「拿上来的底牌」；其余阶段与闲家都是空集合 */
  const markedKeys = $derived(
    deal !== null && deal.phase === 'bury' && view?.you.isDeclarer === true
      ? kittyHandDelta(view.you.hand, deal.originalKitty).map(cardKey)
      : []
  );

  // 每副结束自动弹出结算；关闭后可随时用「结算详情」重开
  $effect(() => {
    if (summary !== null && summary.dealNo !== openedFor) {
      openedFor = summary.dealNo;
      summaryOpen = true;
    }
  });

  function seatAt(index: number) {
    return client.table?.seats[index] ?? null;
  }

  function levelAt(index: number): Level {
    return view?.levels[index] ?? START_LEVEL;
  }

  function isTurnAt(index: number): boolean {
    if (deal === null) return false;
    if (deal.phase === 'auction') return deal.auctionTurn === index;
    if (deal.phase === 'bury') return deal.declarerSeat === index;
    if (deal.phase === 'play') return deal.playTurn === index;
    return false;
  }

  const dotClass = $derived(
    client.connection === 'live'
      ? 'bg-emerald-400'
      : client.connection === 'offline'
        ? 'bg-rose-500'
        : 'bg-amber-300'
  );
</script>

<main class="mx-auto flex h-[100dvh] min-h-0 w-full max-w-6xl flex-col overflow-hidden px-3 py-2 sm:px-4">
  <header class="flex items-center justify-between gap-2 pb-2 text-sm">
    <div class="flex min-w-0 items-center gap-2 sm:gap-3">
      <a class="shrink-0 text-white/50 hover:text-white" href="/">← 大厅</a>
      <!-- 点邀请码即复制邀请链接（原来的「复制链接」按钮已去掉） -->
      <InviteCode
        code={data.code}
        class="shrink-0 font-mono text-base font-bold tracking-[.2em] text-gold sm:text-lg sm:tracking-[.3em]"
      />
    </div>
    <div class="flex shrink-0 items-center gap-2 text-[11px]">
      <a class="rounded-md border border-white/15 px-2 py-0.5 text-white/70 hover:bg-white/10" href="/rules">教程</a>
      <button
        type="button"
        class="rounded-md border border-white/15 px-2 py-0.5 text-white/70 hover:bg-white/10"
        onclick={() => (historyOpen = true)}
      >
        战报
      </button>
      <span class={['h-2 w-2 rounded-full', dotClass]} title="连接状态"></span>
    </div>
  </header>

  {#if client.error}
    <p class="mb-2 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{client.error}</p>
  {/if}

  <div class="felt relative min-h-0 flex-1 rounded-[1.75rem] sm:rounded-[2.5rem]">
    <!-- 三家座位：左＝下家、右＝上家、我＝左下 -->
    <SeatCard
      name={seatAt(leftSeat)?.name ?? null}
      level={levelAt(leftSeat)}
      online={seatAt(leftSeat)?.online ?? false}
      isTurn={isTurnAt(leftSeat)}
      isDeclarer={deal?.declarerSeat === leftSeat}
      class="absolute left-3 top-3 w-36 sm:left-5 sm:top-5 sm:w-44"
    />
    <SeatCard
      name={seatAt(rightSeat)?.name ?? null}
      level={levelAt(rightSeat)}
      online={seatAt(rightSeat)?.online ?? false}
      isTurn={isTurnAt(rightSeat)}
      isDeclarer={deal?.declarerSeat === rightSeat}
      class="absolute right-3 top-3 w-36 sm:right-5 sm:top-5 sm:w-44"
    />
    <SeatCard
      name={data.me.name}
      level={levelAt(data.seat)}
      online={seatAt(data.seat)?.online ?? true}
      isMe
      isTurn={isTurnAt(data.seat)}
      isDeclarer={deal?.declarerSeat === data.seat}
      class="absolute bottom-3 left-3 w-36 sm:bottom-5 sm:left-5 sm:w-44"
    />

    {#if deal === null}
      <LobbyPanel {client} code={data.code} />
    {:else if view !== null}
      {#if deal.phase !== 'auction'}
        <TableStatus {view} />
      {/if}

      {#if deal.phase === 'auction'}
        <BidPanel {client} />
      {:else if deal.phase === 'bury'}
        <BuryPanel {client} />
      {:else}
        <TrickArea {view} seat={data.seat} {names} />
      {/if}
    {/if}
  </div>

  <ActionBar {client} {summaryOpen} onToggleSummary={() => (summaryOpen = !summaryOpen)} />

  <HandFan
    hand={view?.you.hand ?? []}
    {trump}
    selected={client.selected}
    marked={markedKeys}
    {selectable}
    onToggle={(card) => client.toggle(card)}
  />
</main>

{#if view !== null}
  <DealSummary {client} open={summaryOpen} onClose={() => (summaryOpen = false)} />
  <HistoryList {view} {names} open={historyOpen} onClose={() => (historyOpen = false)} />
{/if}
