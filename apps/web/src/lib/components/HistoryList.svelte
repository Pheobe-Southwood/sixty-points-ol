<script lang="ts">
  import type { PublicView } from '@sixty/engine';
  import { bidText, cardText, levelParts, whoLabel } from '$lib/labels';

  /**
   * 战报内容（抽屉「战报」页的正文）。
   *
   * 它自己**没有**抽屉外壳与标题 —— 外壳、标题、关闭都在 `TableDrawer` 一处，
   * 否则每加一页就要复制一遍 `fixed / z-50 / ×` 那套（原来的战报就是自己一套外壳）。
   */
  let {
    view,
    mySeat = -1,
    names = []
  }: {
    view: PublicView;
    /** 文案里的「我的座位」：观战者传 -1，于是都显示玩家名 */
    mySeat?: number;
    names?: readonly (string | null)[];
  } = $props();

  const deals = $derived([...view.history].reverse());
  const who = (seat: number): string => whoLabel(names, mySeat, seat);
</script>

<div class="space-y-2 text-xs">
  {#if deals.length === 0}
    <p class="text-white/45">还没有完成的牌局</p>
  {:else}
    {#each deals as deal (deal.dealNo)}
      <div class="rounded-xl bg-black/30 p-3 ring-1 ring-white/10">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-white/80">
            第 {deal.dealNo} 副 · {bidText(deal.contract)} · 庄 {who(deal.contract.declarerSeat)}
          </span>
          <span class="shrink-0 font-bold {deal.made ? 'text-emerald-300' : 'text-rose-300'}">
            {deal.finalScore} {deal.made ? '打成' : '打输'}
          </span>
        </div>
        <p class="mt-1 leading-relaxed text-white/55">
          底牌 {deal.kitty.map(cardText).join(' ')}（{deal.kittyPoints} 分 × {deal.multiplier}
          {deal.protectedBottom ? ' 保底' : ' 抠底'}）
        </p>
        {#if deal.levelChanges.length > 0}
          <p class="mt-1 text-white/55">
            升级：
            {#each deal.levelChanges as change, index (change.seat)}
              {index > 0 ? '，' : ''}{who(change.seat)} +{change.levels}（{levelParts(change.to).rank}+{levelParts(
                change.to
              ).cycle}）
            {/each}
          </p>
        {/if}
      </div>
    {/each}
  {/if}
</div>
