<script lang="ts">
  import type { PublicView } from '@sixty/engine';
  import { SPECTATOR_LABEL_SEAT } from '$lib/role';
  import { BID_GLYPH, bidText, highestCall, isRedStrain, strainGlyph, trumpText, whoLabel } from '$lib/labels';

  /**
   * 叫牌记录：毡面上的叫牌面板与抽屉里的「叫牌」页**共用这一份**。
   *
   * 两处渲染是故意的（见 CONTEXT.md 的 Flagged ambiguities）：叫牌阶段你正对着毡面操作，
   * 历史就在手边；打牌阶段才需要翻抽屉查「定约是多少、谁叫的」。一份组件两处渲染，
   * 不会出现两套叫牌记录各写一遍再各自过期。
   *
   * 这里**只有记录与展示**：候选叫品按钮与「不叫」留在 `BidPanel`（动作面不进抽屉）。
   */
  let {
    view,
    mySeat = SPECTATOR_LABEL_SEAT,
    names = [],
    heading = true
  }: {
    view: PublicView;
    /** 文案里的「我的座位」：观战者传 -1，于是都显示玩家名 */
    mySeat?: number;
    names?: readonly (string | null)[];
    /** 抽屉里已有页签标题时不重复写一遍「叫牌」 */
    heading?: boolean;
  } = $props();

  const deal = $derived(view.deal);
  /** 顶部大字显示的是**最高叫品**（将要成为定约的那个）；「不叫」只进历史 */
  const top = $derived(highestCall(view));
  const inAuction = $derived(deal !== null && deal.phase === 'auction');
  const myTurn = $derived(inAuction && deal?.auctionTurn === mySeat);
</script>

<div class="flex items-baseline justify-between">
  {#if heading}
    <h2 class="text-sm font-bold">叫牌</h2>
  {/if}
  <span class="text-[11px] text-white/45">
    第 {deal?.dealNo ?? 1} 副 · {whoLabel(names, mySeat, deal?.dealerSeat ?? 0)} 发牌
  </span>
</div>

<div class="mt-2 flex items-baseline justify-between gap-2">
  {#if top === null}
    <span class="text-2xl font-black tracking-wide text-white/35">还没人叫</span>
  {:else}
    <span class="text-3xl font-black leading-none tracking-wide tabular-nums text-gold">
      {top.points}<span class={isRedStrain(top.strain) ? 'text-rose-300' : ''}>{BID_GLYPH[top.strain]}</span>
    </span>
  {/if}
  {#if deal !== null && inAuction}
    <span
      class={[
        'shrink-0 rounded-md px-2 py-1 text-[11px]',
        myTurn ? 'bg-gold/25 ring-1 ring-gold/40' : 'bg-white/10 text-white/55'
      ]}
    >
      {myTurn ? '轮到你' : `${whoLabel(names, mySeat, deal.auctionTurn)} 叫牌中`}
    </span>
  {/if}
</div>

<!-- 成交后：定约与将牌在打牌/结算阶段才是要查的东西（叫牌阶段它们还不存在） -->
{#if deal !== null && deal.contract !== null}
  <p class="mt-2 text-[11px] text-white/55">
    定约 <b class="tabular-nums text-gold">{deal.contract.points}{strainGlyph(deal.contract.strain)}</b>
    · 庄家 {whoLabel(names, mySeat, deal.contract.declarerSeat)}
    {#if deal.trump !== null}
      · {trumpText(deal.trump)}
    {/if}
  </p>
{/if}

<!-- 历史：普通文档流，跟着**外层**滚动区一起滚。
     毡面的叫牌面板是它自己的唯一滚动区（`panel-guard.ts` 明令面板内不许有第二处 overflow-*），
     抽屉里则由抽屉主体滚 —— 所以这里既不许再自己设 max-h，也不许再套一层 overflow。 -->
<div class="mt-3">
  <div class="flex flex-wrap gap-1.5 text-[11px]">
    {#each deal?.auction ?? [] as entry, index (index)}
      <span class="rounded-md bg-white/10 px-2 py-1">
        <span class="text-white/50">{whoLabel(names, mySeat, entry.seat)}</span>
        {bidText(entry.call)}
      </span>
    {/each}
  </div>
</div>
