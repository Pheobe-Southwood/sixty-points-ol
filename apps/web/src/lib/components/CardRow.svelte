<script lang="ts">
  import { cardKey, type Card, type TrumpModel } from '@sixty/engine';
  import CardView from './Card.svelte';

  let {
    cards,
    trump = null,
    size = 'sm',
    gap = 'gap-1.5',
    highlight = [],
    dim = []
  }: {
    cards: readonly Card[];
    trump?: TrumpModel | null;
    size?: 'sm' | 'md' | 'lg';
    gap?: string;
    /** 高亮这些牌（金环），用于教程里点名某几张 */
    highlight?: readonly string[];
    /** 压暗这些牌，用于「反例」 */
    dim?: readonly string[];
  } = $props();
</script>

<div class={['flex flex-wrap items-center', gap]}>
  {#each cards as card (cardKey(card))}
    {@const key = cardKey(card)}
    <span class={highlight.includes(key) ? 'rounded-lg ring-2 ring-gold' : ''}>
      <CardView {card} {trump} {size} muted={dim.includes(key)} />
    </span>
  {/each}
</div>
