<script lang="ts">
  import { cardClass, type Card, type TrumpModel } from '@sixty/engine';
  import { cardFace } from '$lib/card-face';

  let {
    card,
    trump = null,
    size = 'md',
    selected = false,
    muted = false,
    /** 蓝描边标记：埋底阶段用来指出「这几张是拿上来的底牌」 */
    marked = false,
    onclick
  }: {
    card: Card;
    trump?: TrumpModel | null;
    size?: 'sm' | 'md' | 'lg';
    selected?: boolean;
    muted?: boolean;
    marked?: boolean;
    onclick?: () => void;
  } = $props();

  const face = $derived(cardFace(card));
  const isTrump = $derived(trump !== null && cardClass(card, trump) === 'T');
</script>

<!-- 除了主牌金边，牌上没有第二个装饰性标记：角落只有点数 + 花色（王则是「大/小」+「王」），
     正中只有那一门的字形（王则是「大王」/「小王」）。分牌靠点数自己认。 -->
<button
  type="button"
  class={[
    'card',
    size === 'sm' && 'card-sm',
    size === 'lg' && 'card-lg',
    face.red && 'red',
    isTrump && 'trump',
    muted && 'muted'
  ]}
  data-selected={selected}
  data-marked={marked}
  disabled={onclick === undefined}
  aria-label={face.aria}
  onclick={() => onclick?.()}
>
  <span class="idx">
    <span>{face.rank}</span>
    <i>{face.glyph}</i>
  </span>
  <span class="pip" class:joker={face.joker}>{face.pip}</span>
  <span class="idx br">
    <span>{face.rank}</span>
    <i>{face.glyph}</i>
  </span>
</button>
