<script lang="ts">
  import type { LevelRow } from '$lib/labels';
  import LevelBadge from './LevelBadge.svelte';

  /**
   * 升级表：谁 / 原级别 / 新级别。级别渲染**复用座位卡那枚 `LevelBadge`**（档位数字 +
   * 金色「+过次」徽标），所以跨 A 的轮次在这里也读得出来，不是一串 `2(+0) → 3(+0)` 文本。
   *
   * 两处用法：结算弹窗 `heading`（三家都列，没升级的那行淡显、「新级别」格写「不变」）；
   * 战报的每副卡不写表头（历史里只列**升级者**，`→` 自己说明了方向）。
   *
   * 列模版**只有这一份**：表头与数据行必须同一份，否则「谁 / 原级别 / 新级别」三列会各算各的宽度。
   * 第一列 `minmax(0,1fr)` 才能让超长昵称 `truncate`；后三列写死，跨行的列宽因此对齐。
   */
  let {
    rows,
    who,
    heading = false
  }: { rows: readonly LevelRow[]; who: (seat: number) => string; heading?: boolean } = $props();

  const COLS = 'grid grid-cols-[minmax(0,1fr)_3rem_1rem_3rem] items-center gap-x-2';
</script>

<div class="space-y-1 text-xs">
  {#if heading}
    <div class="{COLS} px-3 text-[10px] text-white/45">
      <span>谁</span>
      <span class="text-center">原级别</span>
      <span></span>
      <span class="text-center">新级别</span>
    </div>
  {/if}
  {#each rows as row (row.seat)}
    <div
      class="{COLS} rounded-lg px-3 py-1.5 ring-1 {row.changed
        ? 'bg-gold/15 ring-gold/30'
        : 'bg-white/5 text-white/45 ring-white/10'}"
    >
      <span class="truncate">{who(row.seat)}</span>
      <LevelBadge level={row.from} class={row.changed ? '' : 'opacity-50'} />
      <span class="text-center text-white/40">{row.changed ? '→' : '·'}</span>
      {#if row.changed}
        <LevelBadge level={row.to} />
      {:else}
        <span class="text-center">不变</span>
      {/if}
    </div>
  {/each}
</div>
