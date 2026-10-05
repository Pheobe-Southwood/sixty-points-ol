<script lang="ts">
  import type { DealSummary } from '@sixty/engine';
  import { kittySign } from '$lib/labels';
  import CardView from './Card.svelte';

  /**
   * 结算算式：`墩分 ± 底分 × 末轮张数 = 最终得分`，底牌 3 张挂在底分那一格下面。
   *
   * 为什么抽出来：结算弹窗与战报的每副卡是**同一条算式**（同一个 `kittySign`、同一份子标），
   * 只有尺寸不同 —— 两处各写一份，改一处就会出现两种读法。子标文案只有一份，两档都不许改写。
   *
   * 两档尺寸（`compact`）：`modal` 给结算弹窗，`compact` 给抽屉里的战报卡（正文约 280px 宽，
   * 四个格子加起来必须放得下）。底牌小牌面在弹窗里挂在底分格子下面（那格够宽），窄幅里放不下，
   * 所以 `compact` 时改成算式下面自成一行居中。
   *
   * 符号那一枚是全条算式里唯一决定「加还是扣」的东西，所以它与数字**同级字号字重**、并按
   * 保底/抠底着色（绿 / 红）。`s.num` 这一个 token 同时给四个数字与那个符号：两档尺寸各自只改它，
   * 「同级字号」由此成为结构上的事实，而不是两处各写一遍的字面量。
   */
  let { summary, compact = false }: { summary: DealSummary; compact?: boolean } = $props();

  const SIZES = {
    modal: { num: 'text-[26px]', box: 'w-14', gap: 'gap-1.5' },
    compact: { num: 'text-xl', box: 'w-10', gap: 'gap-1' }
  } as const;
  const s = $derived(compact ? SIZES.compact : SIZES.modal);
</script>

{#snippet kittyCards()}
  <div class="kitty-mini flex justify-center">
    {#each summary.kitty as card, index (index)}
      <CardView {card} trump={summary.trump} size="sm" />
    {/each}
  </div>
{/snippet}

<!-- 一条算式，各项下方标注含义 -->
<div class="flex items-start justify-center {s.gap}">
  <div class="{s.box} text-center">
    <p class="{s.num} font-black leading-none tabular-nums">{summary.declarerTrickPoints}</p>
    <p class="mt-1.5 text-[10px] text-white/50">墩分</p>
  </div>
  <span
    class="{s.num} font-black leading-none {summary.protectedBottom
      ? 'text-emerald-300'
      : 'text-rose-300'}">{kittySign(summary.protectedBottom)}</span
  >
  <div class="{s.box} text-center">
    <p class="{s.num} font-black leading-none tabular-nums">{summary.kittyPoints}</p>
    <p class="mt-1.5 text-[10px] text-white/50">底分</p>
    {#if !compact}
      <div class="mt-1">{@render kittyCards()}</div>
    {/if}
  </div>
  <span class="mt-2 text-lg leading-none text-white/40">×</span>
  <div class="{s.box} text-center">
    <p class="{s.num} font-black leading-none tabular-nums text-gold">{summary.multiplier}</p>
    <p class="mt-1.5 text-[10px] text-white/50">末轮张数</p>
  </div>
  <span class="mt-2 text-lg leading-none text-white/40">=</span>
  <div class="{s.box} text-center">
    <p class="{s.num} font-black leading-none tabular-nums text-gold">{summary.finalScore}</p>
    <p class="mt-1.5 text-[10px] text-white/50">最终得分</p>
  </div>
</div>

{#if compact}
  <div class="mt-2">{@render kittyCards()}</div>
{/if}
