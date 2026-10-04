<script lang="ts">
  import { cardKey, type Card, type Seat, type TrumpModel } from '@sixty/engine';
  import CardView from '$lib/components/Card.svelte';
  import { cardAnimKey, receiveCard } from './motion';

  let {
    cards,
    seat,
    trump = null,
    caption = null,
    badge = null,
    popKey = 0
  }: {
    cards: readonly Card[];
    /** 出牌人：配对键里带着它，手牌横条里飞出来的那张牌才能落到正确的堆上 */
    seat: Seat;
    trump?: TrumpModel | null;
    /** 牌堆上方的小字（出牌人） */
    caption?: string | null;
    /** 牌堆下方的金色徽标（赢墩），弹入 */
    badge?: string | null;
    /** 徽标的重播键（传墩号）：同一家连着赢两墩时也要再弹一次 */
    popKey?: number;
  } = $props();
</script>

<!-- 出牌区：与 `TrickCluster` 同一套 `.cluster` 外观，唯一的区别是每张牌外面套了一层
     `<span class="drop-card">` —— crossfade 的动画节点必须是元素，而配对键要按「哪张牌」给。
     所以偏移样式写成 `.trick-drop > :nth-child(n) .card`（见 app.css），不动牌桌那一份。 -->
<div class="flex flex-col items-center gap-1">
  {#if caption !== null}
    <p class="text-[10px] text-white/45">{caption}</p>
  {/if}
  <div class="cluster trick-drop">
    {#each cards as card (cardKey(card))}
      <span class="drop-card" in:receiveCard={{ key: cardAnimKey(seat, cardKey(card)) }}>
        <CardView {card} {trump} size="sm" />
      </span>
    {/each}
  </div>
  {#if badge !== null}
    <p class="mt-0.5 text-center">
      {#key popKey}
        <span class="pts-pop inline-block rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-ink shadow">
          {badge}
        </span>
      {/key}
    </p>
  {/if}
</div>
