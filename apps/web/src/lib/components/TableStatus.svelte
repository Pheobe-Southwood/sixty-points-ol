<script lang="ts">
  import type { PublicView } from '@sixty/engine';
  import { isRedStrain, strainGlyph } from '$lib/labels';

  let { view }: { view: PublicView } = $props();

  const deal = $derived(view.deal);
  const contract = $derived(deal?.contract ?? null);
  const trickNo = $derived((deal?.trickHistory.length ?? 0) + 1);
  const declarerPoints = $derived(
    contract === null ? 0 : (deal?.captured[contract.declarerSeat]?.points ?? 0)
  );

  /**
   * 定约与「庄已抓」是本副最该被一眼看到的两个数（打牌时决定进退，埋底/结算时是背景），
   * 所以它们是**大号金色数字**，不是和小字同级的 chip；`第 N 轮` 才是陪衬。
   */
  const chip = 'rounded-full bg-black/35 px-2.5 py-1 ring-1 ring-white/10';
  const stat = 'flex items-baseline gap-1.5 rounded-xl bg-black/45 px-3 py-1 ring-1';
  const num = 'text-xl font-black leading-none tabular-nums text-gold sm:text-2xl';
  const label = 'text-[11px] text-white/60';
</script>

<!-- 普通文档流（**不再自己绝对定位**）：由牌桌页把它和埋底面板放进同一个列容器，
     于是短屏上「定约」等信息不会压到埋底槽位上（手机端曾经两处各定各的位置而重叠）。
     不再单列「级牌 X」（庄家座位卡上的级别数字就是它），也不再写「庄已抓 X / 需 Y」
     ——分母就是旁边那个定约分，重复一次只会让状态条更长。 -->
<!-- 普通文档流（**不再自己绝对定位**）：由牌桌页把它和埋底面板放进同一个列容器，
     于是短屏上「定约」等信息不会压到埋底槽位上（手机端曾经两处各定各的位置而重叠）。
     不再单列「级牌 X」（庄家座位卡上的级别数字就是它），也不再写「庄已抓 X / 需 Y」
     ——分母就是旁边那个定约分，重复一次只会让状态条更长。
     纯信息条（没有一个可点元素）⇒ 也让它让开点击：它与座位卡同处一层，窄桌面上会盖住
     座位卡上的动作按钮（「+ 机器人」/「请离」）。 -->
<div class="pointer-events-none flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
  <span class={`${chip} text-[11px] text-white/55`}>第 <b class="tabular-nums text-white/90">{trickNo}</b> 轮</span>
  {#if contract}
    <span class={`${stat} ring-gold/25`}>
      <b class={num}>
        {contract.points}<span class={isRedStrain(contract.strain) ? 'text-rose-300' : ''}>{strainGlyph(
          contract.strain
        )}</span>
      </b>
      <span class={label}>定约</span>
    </span>
    <span class={`${stat} ring-white/10`}>
      <span class={label}>庄已抓</span>
      <b class={num}>{declarerPoints}</b>
      <span class={label}>分</span>
    </span>
  {/if}
</div>
