<script lang="ts">
  import type { PersonalView } from '@sixty/engine';
  import { bidText, cardText, levelParts, whoLabel } from '$lib/labels';

  let {
    view,
    names = [],
    open = false,
    onClose
  }: {
    view: PersonalView;
    names?: readonly (string | null)[];
    open?: boolean;
    onClose?: () => void;
  } = $props();

  const deals = $derived([...view.history].reverse());
  const who = (seat: number): string => whoLabel(names, view.you.seat, seat);
</script>

{#if open}
  <aside
    class="fixed inset-y-0 right-0 z-50 flex w-[22rem] max-w-[92vw] flex-col bg-felt-950/95 ring-1 ring-white/10 backdrop-blur"
  >
    <header class="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <h2 class="text-sm font-semibold">战报</h2>
      <button
        type="button"
        class="rounded-md px-2 text-lg leading-none text-white/50 hover:bg-white/10 hover:text-white"
        aria-label="关闭战报"
        onclick={() => onClose?.()}>×</button
      >
    </header>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 text-xs">
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
  </aside>
{/if}
