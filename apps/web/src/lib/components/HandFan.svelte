<script lang="ts">
  import { cardKey, cardsPoints, type Card, type TrumpModel } from '@sixty/engine';
  import { computeFanLayout } from '$lib/fan-layout';
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

  let containerWidth = $state(0);
  let cardWidth = $state(0);
  let fanEl = $state<HTMLDivElement | null>(null);

  const count = $derived(hand.length);

  // 牌宽随断点变化（桌面 68 / 窄屏 50），实测比猜断点可靠
  $effect(() => {
    void count;
    void containerWidth;
    const first = fanEl?.querySelector<HTMLElement>('.card');
    cardWidth = first ? first.getBoundingClientRect().width : 0;
  });

  const layout = $derived(computeFanLayout({ count, cardWidth, containerWidth }));

  /** 多行时按 perRow 切片；单行时就是一个整行 */
  const rows = $derived.by(() => {
    if (layout.rows <= 1) return [hand as readonly Card[]];
    const out: Card[][] = [];
    for (let i = 0; i < hand.length; i += layout.perRow) {
      out.push(hand.slice(i, i + layout.perRow) as Card[]);
    }
    return out;
  });

  // 未测量时不写内联变量，样式交给 app.css 的默认回退值
  const measured = $derived(layout.override && cardWidth > 0);
</script>

<p class="mb-1.5 text-center text-[11px] text-white/40">
  {hint ?? `我的手牌 · ${hand.length} 张 · ${cardsPoints(hand)} 分`}
</p>

<div class="fan-rows" bind:clientWidth={containerWidth} bind:this={fanEl}>
  {#each rows as row, rowIndex (rowIndex)}
    <div
      class={['fan', selectable && 'selectable']}
      data-measured={measured}
      style={measured ? `--step:${layout.step}px` : null}
    >
      {#each row as card (cardKey(card))}
        <CardView
          {card}
          {trump}
          size="lg"
          selected={selected.includes(cardKey(card))}
          onclick={selectable ? () => onToggle?.(card) : undefined}
        />
      {/each}
    </div>
  {/each}
</div>
