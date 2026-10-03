<script lang="ts">
  import { cardClass, cardPoints, isJoker, rankLabel, SUIT_LABEL, type Card, type TrumpModel } from '@sixty/engine';

  let {
    card,
    trump = null,
    size = 'md',
    selected = false,
    muted = false,
    onclick
  }: {
    card: Card;
    trump?: TrumpModel | null;
    size?: 'sm' | 'md' | 'lg';
    selected?: boolean;
    muted?: boolean;
    onclick?: () => void;
  } = $props();

  const face = $derived.by(() => {
    const c = card;
    if (isJoker(c)) {
      return {
        rank: c.joker === 'big' ? '大' : '小',
        glyph: c.joker === 'big' ? '☀' : '☾',
        pip: '王',
        red: c.joker === 'big',
        aria: c.joker === 'big' ? '大王' : '小王'
      };
    }
    return {
      rank: rankLabel(c.rank),
      glyph: SUIT_LABEL[c.suit],
      pip: SUIT_LABEL[c.suit],
      red: c.suit === 'H' || c.suit === 'D',
      aria: `${SUIT_LABEL[c.suit]}${rankLabel(c.rank)}`
    };
  });

  const isTrump = $derived(trump !== null && cardClass(card, trump) === 'T');
  const isPoint = $derived(cardPoints(card) > 0);
</script>

<button
  type="button"
  class={[
    'card',
    size === 'sm' && 'card-sm',
    size === 'lg' && 'card-lg',
    face.red && 'red',
    isTrump && 'trump',
    isPoint && 'pt',
    muted && 'muted'
  ]}
  data-selected={selected}
  disabled={onclick === undefined}
  aria-label={face.aria}
  onclick={() => onclick?.()}
>
  <span class="idx">
    <span>{face.rank}</span>
    {#if !isJoker(card)}<i>{face.glyph}</i>{/if}
  </span>
  <span class="pip">{face.pip}</span>
  {#if !isJoker(card)}
    <span class="idx br">
      <span>{face.rank}</span>
      <i>{face.glyph}</i>
    </span>
  {/if}
</button>
