<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { cardKey, START_LEVEL, type Level } from '@sixty/engine';
  import { TableClient } from '$lib/client/table.svelte';
  import { anchorSeatOf, labelSeatOf } from '$lib/role';
  import ActionBar from '$lib/components/ActionBar.svelte';
  import BidPanel from '$lib/components/BidPanel.svelte';
  import BuryPanel from '$lib/components/BuryPanel.svelte';
  import DealSummary from '$lib/components/DealSummary.svelte';
  import HandFan from '$lib/components/HandFan.svelte';
  import HistoryList from '$lib/components/HistoryList.svelte';
  import IdentityQuickEdit from '$lib/components/IdentityQuickEdit.svelte';
  import InviteCode from '$lib/components/InviteCode.svelte';
  import LobbyPanel from '$lib/components/LobbyPanel.svelte';
  import SeatActions from '$lib/components/SeatActions.svelte';
  import SeatCard from '$lib/components/SeatCard.svelte';
  import TableStatus from '$lib/components/TableStatus.svelte';
  import TrickArea from '$lib/components/TrickArea.svelte';
  import { kittyHandDelta } from '$lib/labels';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // 只取首次 SSR 数据构造客户端状态，不随后续 data 变化重建（角色与手牌以 SSE 负载为准）
  const client = untrack(
    () =>
      new TableClient(
        data.code,
        { role: data.role, view: data.view, you: data.you, table: data.table },
        data.inherited
      )
  );

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
  const you = $derived(client.you);
  const seated = $derived(you !== null);
  /** 文本里一律用玩家名指代（不再有东/南/西）：座位卡显示的就是这些名字 */
  const names = $derived((client.table?.seats ?? []).map((seat) => seat.name));

  /**
   * 布局锚点与「我的座位」**只由 `you` 决定**（观战者 = 固定锚点 + 谁都不叫「你」）。
   *
   * 曾经这里回退到 SSR 的 `data.seat`：那个值只在上次 load 时算过，多标签页里另一处离座、
   * 或离座当帧 SSE 先到时，观战者会顶着旧座位被叫「你」。`data.seat` 已随之下线。
   */
  const anchor = $derived(anchorSeatOf(you?.seat ?? null));
  const label = $derived(labelSeatOf(you?.seat ?? null));

  const leftSeat = $derived((anchor + 1) % 3);
  const rightSeat = $derived((anchor + 2) % 3);
  /** 三个座位卡的绝对定位类：必须只来自这里，别与自身的 position 类混用（见 ui-check） */
  const SPOTS = [
    'left-3 top-3 sm:left-5 sm:top-5',
    'right-3 top-3 sm:right-5 sm:top-5',
    'bottom-3 left-3 sm:bottom-5 sm:left-5'
  ] as const;

  const selectable = $derived(
    you !== null &&
      view !== null &&
      deal !== null &&
      ((deal.phase === 'play' && deal.playTurn === you.seat) ||
        (deal.phase === 'bury' && you.isDeclarer))
  );

  /** 埋底阶段给庄家的手牌标出「拿上来的底牌」；其余阶段与闲家都是空集合（观战者没有 you） */
  const markedKeys = $derived(
    deal !== null && deal.phase === 'bury' && you?.isDeclarer === true
      ? kittyHandDelta(you.hand, you.originalKitty).map(cardKey)
      : []
  );

  // 每副结束自动弹出结算；关闭后可随时用「结算详情」重开（观战者也照弹，结算信息本来就是公开的）
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
      <!-- 观战人数是「正在看」的实时口径，只在有人看时出现，不列名单 -->
      {#if (client.table?.spectatorCount ?? 0) > 0}
        <span class="rounded-md border border-white/10 px-2 py-0.5 text-white/45">
          {client.table?.spectatorCount} 人观战
        </span>
      {/if}
      {#if client.role === 'spectator'}
        <span class="rounded-md bg-white/10 px-2 py-0.5 text-white/70">观战中</span>
      {/if}
      <a class="rounded-md border border-white/15 px-2 py-0.5 text-white/70 hover:bg-white/10" href="/rules">教程</a>
      <button
        type="button"
        class="rounded-md border border-white/15 px-2 py-0.5 text-white/70 hover:bg-white/10"
        onclick={() => (historyOpen = true)}
      >
        战报
      </button>
      <SeatActions {client} />
      {#if !seated}
        <IdentityQuickEdit {client} />
      {/if}
      <span class={['h-2 w-2 rounded-full', dotClass]} title="连接状态"></span>
    </div>
  </header>

  {#if client.error}
    <p class="mb-2 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-200">{client.error}</p>
  {/if}

  <!-- 中途补位：接下的是别人的手牌与进度，说一声再让人上手（关掉即消，不常驻） -->
  {#if client.inheritedNotice && you !== null}
    <div class="mb-2 flex items-center gap-2 rounded-lg bg-gold/15 px-3 py-2 text-xs text-gold ring-1 ring-gold/30">
      <span class="min-w-0 flex-1">
        这一副正在进行：你补进了空座，接下这手 <b class="tabular-nums">{you.hand.length}</b> 张牌继续打完。
      </span>
      <button
        type="button"
        class="shrink-0 rounded-md border border-gold/40 px-2 py-0.5 text-[11px] hover:bg-gold/10"
        onclick={() => (client.inheritedNotice = false)}
      >
        知道了
      </button>
    </div>
  {/if}

  <div class="felt relative min-h-0 flex-1 rounded-[1.75rem] sm:rounded-[2.5rem]">
    <!-- 三家座位：左＝下家、右＝上家、我＝左下；观战者没有「我」，三张卡都显示玩家名 -->
    {#each [leftSeat, rightSeat, anchor] as seat, index (seat)}
      <SeatCard
        name={seatAt(seat)?.name ?? null}
        level={levelAt(seat)}
        online={seatAt(seat)?.online ?? false}
        isMe={seated && seat === (you?.seat ?? -1)}
        isTurn={isTurnAt(seat)}
        isDeclarer={deal?.declarerSeat === seat}
        class={`absolute w-36 sm:w-44 ${SPOTS[index]}`}
      />
    {/each}

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
        <TrickArea {view} seat={anchor} mySeat={label} {names} />
      {/if}
    {/if}
  </div>

  <ActionBar {client} {summaryOpen} onToggleSummary={() => (summaryOpen = !summaryOpen)} />

  <!-- 观战者没有手牌：手牌区整块消失，牌桌更大 -->
  {#if you !== null}
    <HandFan
      hand={you.hand}
      {trump}
      selected={client.selected}
      marked={markedKeys}
      {selectable}
      onToggle={(card) => client.toggle(card)}
    />
  {/if}
</main>

{#if view !== null}
  <DealSummary {client} open={summaryOpen} onClose={() => (summaryOpen = false)} />
  <HistoryList {view} mySeat={label} {names} open={historyOpen} onClose={() => (historyOpen = false)} />
{/if}
