<script lang="ts">
  import { cardKey, type PersonalView } from '@sixty/engine';
  import CardView from './Card.svelte';
  import { seatLabel } from '$lib/labels';

  let { view, seat }: { view: PersonalView; seat: number } = $props();

  const deal = $derived(view.deal);
  const trump = $derived(deal?.trump ?? null);

  /** 我正在看的一墩：当前墩已有出牌就看当前，否则回看上一条已完成的墩 */
  const current = $derived(deal?.trick ?? null);
  const previous = $derived(
    deal !== null && deal.trickHistory.length > 0 ? deal.trickHistory[deal.trickHistory.length - 1]! : null
  );
  const showingCurrent = $derived(current !== null && current.plays.length > 0);
  const plays = $derived(showingCurrent ? current!.plays : (previous?.plays ?? []));
  const winnerSeat = $derived(showingCurrent ? null : (previous?.winnerSeat ?? null));
  const trickPoints = $derived(showingCurrent ? 0 : (previous?.points ?? 0));

  const leftSeat = $derived((seat + 1) % 3);
  const rightSeat = $derived((seat + 2) % 3);

  /** 三家方位：左（下家）左上、右（上家）右上、我正中下；窄屏上下错开避免两墩重叠 */
  function spotOf(target: number): string {
    if (target === leftSeat) return 'absolute left-[6%] top-36 sm:left-[24%] sm:top-[36%]';
    if (target === rightSeat) return 'absolute right-[6%] top-56 sm:right-[24%] sm:top-[36%]';
    return 'absolute inset-x-0 bottom-[20%]';
  }
</script>

{#if plays.length === 0}
  <p class="absolute inset-x-0 top-[38%] px-4 text-center text-xs text-white/45">
    等待庄家埋底并领出第一轮…
  </p>
{:else}
  {#each plays as play (play.seat)}
    <div class={spotOf(play.seat)}>
      <p class="mb-1 text-center text-[10px] text-white/45">{seatLabel(play.seat)}</p>
      <div class="cluster drop-in">
        {#each play.cards as card (cardKey(card))}
          <CardView {card} {trump} size="sm" />
        {/each}
      </div>
      {#if winnerSeat === play.seat}
        <p class="mt-1 text-center">
          <span class="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-ink shadow"
            >上一轮 · 赢墩 +{trickPoints} 分</span
          >
        </p>
      {/if}
    </div>
  {/each}
{/if}
