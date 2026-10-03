<script lang="ts">
  import { cardKey, cardsPoints, type Card, type TrumpModel } from '@sixty/engine';
  import CardView from './Card.svelte';

  let {
    hand,
    trump = null,
    selected = [],
    selectable = false,
    hint = null,
    onToggle
  }: {
    hand: readonly Card[];
    trump?: TrumpModel | null;
    selected?: readonly string[];
    selectable?: boolean;
    hint?: string | null;
    onToggle?: (card: Card) => void;
  } = $props();
</script>

<p class="mb-1.5 text-center text-[11px] text-white/40">
  {hint ?? `我的手牌 · ${hand.length} 张 · ${cardsPoints(hand)} 分`}
</p>

<div class={['fan', selectable && 'selectable']}>
  {#each hand as card (cardKey(card))}
    <CardView
      {card}
      {trump}
      size="lg"
      selected={selected.includes(cardKey(card))}
      onclick={selectable ? () => onToggle?.(card) : undefined}
    />
  {/each}
</div>
