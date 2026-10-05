<script lang="ts">
  import { cardClass, cardKey, isJoker, sortHand, SUIT_LABEL, suitDisplayOrder, type Card, type CardClass, type Seat } from '@sixty/engine';
  import CardView from '$lib/components/Card.svelte';
  import { handFromKeys } from '$lib/story/replay';
  import type { StoryDealData } from '$lib/story/story-data';
  import type { SeatHands } from '$lib/tutorial/position';
  import { fly } from 'svelte/transition';
  import { cardAnimKey, motionMs, sendCard } from './motion';

  let {
    story,
    hands,
    activeSeat = null,
    caption = null
  }: {
    story: StoryDealData;
    hands: SeatHands;
    /** 这一屏正在动的那个人：横条加一圈金环（叫牌时是刚开口的那家，出牌时是这一墩的赢家） */
    activeSeat?: Seat | null;
    /** 横条上方的说明，如「打完这一墩，三家剩下这些」 */
    caption?: string | null;
  } = $props();

  const trump = $derived(story.deal.trump);

  /**
   * 固定槽位，顺序与引擎的 `sortHand` 一致：主牌一段，随后副牌按 `suitDisplayOrder`
   * （副牌黑红交替，主打 ♣ 时 ♥ 与 ♦ 不会被排在一起）。
   */
  interface Slot {
    readonly cls: CardClass;
    readonly label: string;
    readonly cards: readonly Card[];
  }

  /**
   * 槽位**固定**、只有里面的牌会增删 —— 这是有意的：如果某一门打空就让整个分组消失，
   * 分组里最后一张牌的 `out:` 过渡会随父节点一起被拆掉，那张牌就不会飞进出牌区。
   */
  function slotsOf(keys: readonly string[], t: StoryDealData['deal']['trump']): Slot[] {
    const sorted = sortHand(handFromKeys(keys), t);
    const clsOf = (card: Card): CardClass => (t === null ? (isJoker(card) ? 'T' : card.suit) : cardClass(card, t));
    const order: readonly CardClass[] = ['T', ...suitDisplayOrder(t)];
    return order.map((cls) => ({
      cls,
      label: cls === 'T' ? '主' : SUIT_LABEL[cls],
      cards: sorted.filter((card) => clsOf(card) === cls)
    }));
  }

  const rows = $derived(
    ([0, 1, 2] as const).map((seat) => {
      const keys = hands[seat];
      const slots = slotsOf(keys, trump);
      return {
        seat,
        name: story.names[seat],
        total: keys.length,
        trumps: slots[0]!.cards.length,
        slots
      };
    })
  );
</script>

<!-- 三家当前的牌：叫牌屏与出牌屏共用同一条横条，翻页时只增删里面的牌，
     所以「打出去的牌从手里飞走」是同一份 DOM 的自然结果，而不是另画一遍动画。 -->
<div class="grid gap-1.5" data-seat-hands>
  {#if caption !== null}
    <p class="text-[10px] text-white/45">{caption}</p>
  {/if}
  {#each rows as row (row.seat)}
    <div
      class={[
        'hand-strip flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-black/30 px-2 py-1.5',
        row.seat === activeSeat ? 'ring-1 ring-gold' : 'ring-1 ring-white/5'
      ]}
      data-seat-hand={row.seat}
      data-seat-total={row.total}
    >
      <span class="w-12 shrink-0 truncate text-[11px] font-semibold text-white/70">{row.name}</span>
      <span class="shrink-0 text-[10px] tabular-nums text-white/45">{row.total} 张 · 主 {row.trumps} 张</span>
      {#if row.total === 0}
        <span class="text-[10px] text-white/30">—</span>
      {:else}
        {#each row.slots as slot (slot.cls)}
          <!-- 槽位一直在，只有标签与牌会随打空而消失：见 slotsOf 的注释 -->
          {#if slot.cards.length > 0}
            <span class="flex items-center gap-1" data-seat-slot={`${row.seat}-${slot.cls}`}>
              <span class="text-[10px] text-white/35">{slot.label}</span>
              {#each slot.cards as card (cardKey(card))}
                <span
                  class="hand-card"
                  in:fly={{ y: -10, duration: motionMs(200) }}
                  out:sendCard={{ key: cardAnimKey(row.seat, cardKey(card)) }}
                >
                  <CardView {card} {trump} size="sm" />
                </span>
              {/each}
            </span>
          {/if}
        {/each}
      {/if}
    </div>
  {/each}
</div>
