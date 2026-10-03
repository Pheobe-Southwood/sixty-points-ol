<script lang="ts">
  import type { PublicView } from '@sixty/engine';
  import { strainGlyph } from '$lib/labels';

  let { view }: { view: PublicView } = $props();

  const deal = $derived(view.deal);
  const contract = $derived(deal?.contract ?? null);
  const trickNo = $derived((deal?.trickHistory.length ?? 0) + 1);
  const declarerPoints = $derived(
    contract === null ? 0 : (deal?.captured[contract.declarerSeat]?.points ?? 0)
  );

  const chip = 'rounded-full bg-black/35 px-2.5 py-1 ring-1 ring-white/10 sm:px-3';
</script>

<!-- inset-x-0 全宽居中：绝对定位收缩盒若只配 left-1/2 会被限制在半边宽度，窄屏会挤成多行。
     不再单列「级牌 X」（庄家座位卡上的级别数字就是它），也不再写「庄已抓 X / 需 Y」
     ——分母就是旁边那个定约分，重复一次只会让状态条更长。 -->
<div
  class="absolute inset-x-0 top-[5.5rem] flex flex-wrap justify-center gap-1.5 px-2 text-[10px] sm:top-6 sm:text-[11px]"
>
  <span class={chip}>第 <b>{trickNo}</b> 轮</span>
  {#if contract}
    <span class={chip}><b class="text-gold">{contract.points}{strainGlyph(contract.strain)}</b> 定约</span>
    <span class={chip}>庄已抓 <b class="tabular-nums text-gold">{declarerPoints}</b> 分</span>
  {/if}
</div>
