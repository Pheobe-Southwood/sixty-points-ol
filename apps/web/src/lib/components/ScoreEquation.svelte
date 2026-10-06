<script lang="ts">
  import type { DealSummary } from '@sixty/engine';
  import { kittySign } from '$lib/labels';
  import CardView from './Card.svelte';

  /**
   * 结算算式：`墩分 ± 底分 × 末轮张数 = 最终得分`，底牌 3 张挂在底分那一格下面。
   *
   * 为什么抽出来：结算弹窗与战报的每副卡是**同一条算式**（同一个 `kittySign`、同一份子标），
   * 只有尺寸不同 —— 两处各写一份，改一处就会出现两种读法。子标文案只有一份，三档都不许改写。
   *
   * 三档尺寸（`compact` / `ghost`）：`modal` 给结算弹窗，`compact` 给抽屉里的战报卡（正文约 280px
   * 宽，四个格子加起来必须放得下），`ghost` 给机器重演展开体（ADR-0016）—— 它是那张卡的**枝干**，
   * 数字比 `compact` 再小一档（20px → 16px，子标 10px → 9px），底牌小牌面同时淡一档，
   * 否则展开体会与主卡同字号、喧宾夺主。大小三档都只是 token 不同，符号与数字仍共用 `s.num`。
   *
   * 底牌小牌面在弹窗里挂在底分格子下面（那格够宽），窄幅两档（`compact` / `ghost`）里放不下，
   * 所以改成算式下面自成一行居中。
   *
   * 符号那一枚是全条算式里唯一决定「加还是扣」的东西，所以它与数字**同级字号字重**、并按
   * 保底/抠底着色（绿 / 红）。`s.num` 这一个 token 同时给四个数字与那个符号：各档尺寸各自只改它，
   * 「同级字号」由此成为结构上的事实，而不是各处各写一遍的字面量。
   */
  let {
    summary,
    compact = false,
    ghost = false
  }: { summary: DealSummary; compact?: boolean; ghost?: boolean } = $props();

  const SIZES = {
    modal: {
      num: 'text-[26px]',
      box: 'w-14',
      gap: 'gap-1.5',
      label: 'mt-1.5 text-[10px] text-white/50',
      op: 'mt-2 text-lg'
    },
    compact: {
      num: 'text-xl',
      box: 'w-10',
      gap: 'gap-1',
      label: 'mt-1.5 text-[10px] text-white/50',
      op: 'mt-2 text-lg'
    },
    ghost: {
      num: 'text-base',
      box: 'w-9',
      gap: 'gap-0.5',
      label: 'mt-1 text-[9px] text-white/45',
      op: 'mt-1 text-sm'
    }
  } as const;
  const s = $derived(ghost ? SIZES.ghost : compact ? SIZES.compact : SIZES.modal);
  /** 窄幅两档（战报卡与重演展开体）里，底牌小牌面放不进底分那一格，改成算式下面自成一行 */
  const narrow = $derived(compact || ghost);
</script>

{#snippet kittyCards()}
  <div class="kitty-mini flex justify-center {ghost ? 'opacity-75' : ''}">
    {#each summary.kitty as card, index (index)}
      <CardView {card} trump={summary.trump} size="sm" />
    {/each}
  </div>
{/snippet}

<!-- 一条算式，各项下方标注含义 -->
<div class="flex items-start justify-center {s.gap}">
  <div class="{s.box} text-center">
    <p class="{s.num} font-black leading-none tabular-nums">{summary.declarerTrickPoints}</p>
    <p class="{s.label}">墩分</p>
  </div>
  <span
    class="{s.num} font-black leading-none {summary.protectedBottom
      ? 'text-emerald-300'
      : 'text-rose-300'}">{kittySign(summary.protectedBottom)}</span
  >
  <div class="{s.box} text-center">
    <p class="{s.num} font-black leading-none tabular-nums">{summary.kittyPoints}</p>
    <p class="{s.label}">底分</p>
    {#if !narrow}
      <div class="mt-1">{@render kittyCards()}</div>
    {/if}
  </div>
  <span class="{s.op} leading-none text-white/40">×</span>
  <div class="{s.box} text-center">
    <p class="{s.num} font-black leading-none tabular-nums text-gold">{summary.multiplier}</p>
    <p class="{s.label}">末轮张数</p>
  </div>
  <span class="{s.op} leading-none text-white/40">=</span>
  <div class="{s.box} text-center">
    <p class="{s.num} font-black leading-none tabular-nums text-gold">{summary.finalScore}</p>
    <p class="{s.label}">最终得分</p>
  </div>
</div>

{#if narrow}
  <div class="mt-2">{@render kittyCards()}</div>
{/if}
