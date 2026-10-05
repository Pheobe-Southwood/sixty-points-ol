<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import { helpKeyOf, phaseHelp } from '@sixty/engine';
  import { SPECTATOR_LABEL_SEAT } from '$lib/role';
  import { whoLabel } from '$lib/labels';
  import ActionClock from './ActionClock.svelte';
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
  /** 观战者：mySeat = -1 让下面所有「你」的判断自动不成立，不需要另写一套分支 */
  const spectating = $derived(client.you === null);
  const mySeat = $derived(client.you?.seat ?? SPECTATOR_LABEL_SEAT);
  const isDeclarer = $derived(client.you?.isDeclarer ?? false);
  const names = $derived((client.table?.seats ?? []).map((seat) => seat.name));

  const myTurn = $derived(deal !== null && deal.phase === 'play' && deal.playTurn === mySeat);

  const help = $derived(
    phaseHelp(
      helpKeyOf({
        phase: phase ?? 'lobby',
        isDeclarer,
        myTurn,
        spectating,
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

  /**
   * 只剩两类按钮：结算阶段的「结算详情 / 下一副 / 开新对局」。
   * 出牌与埋底的动作控件（已选张数、出牌、清空、确认埋底）已搬进 `ActionTray` ——
   * 它们只在「该你出手」时存在，挤在这一行里会让窄屏换行、并把整页高度顶来顶去。
   */
  const gold =
    'rounded-lg bg-gold px-4 py-1.5 text-xs font-bold text-ink transition enabled:hover:brightness-110 disabled:opacity-30';
</script>

<!-- z-10：手牌容器在 DOM 里排在操作条之后，上浮的选中牌会盖到这一条上。
     这里只剩信息（「?」与状态句），抬到牌面之上是为了让它们始终读得到；
     `.play-btn` 的 z-20 仍在 ActionTray 里保着出牌键不被任何牌盖住。 -->
<div class="relative z-10 flex min-h-[2.6rem] flex-wrap items-center gap-2 py-1.5">
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

  <!-- 距上一步多久：轮到自己时上面那句状态是 null，但计时照常显示 —— 那时它读作「你自己想了多久」。
       `ml-auto` 把它推到这一条的右端：手机窄屏上「该你出手」时动作托盘正居中都悬在中间，
       计时留在左端会被那张托盘压掉。 -->
  <ActionClock class="ml-auto" ageMs={client.table?.actionAgeMs ?? null} />

  {#if phase === 'scored'}
    <button
      type="button"
      class="rounded-lg border border-gold/50 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/10"
      onclick={() => onToggleSummary?.()}
    >
      {summaryOpen ? '收起结算' : '结算详情'}
    </button>
    <!-- 发牌与开新对局只属于在座玩家；观战者看完结算即可 -->
    {#if !spectating}
      {#if finished}
        <button type="button" class={gold} disabled={client.busy} onclick={() => void client.newGame()}>
          开新对局（级别重置）
        </button>
      {:else}
        <button type="button" class={gold} disabled={client.busy} onclick={() => void client.deal()}>下一副</button>
      {/if}
    {/if}
  {/if}
</div>
