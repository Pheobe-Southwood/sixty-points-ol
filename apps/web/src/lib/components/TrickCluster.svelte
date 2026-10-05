<script lang="ts">
  import { cardKey, type Card, type TrumpModel } from '@sixty/engine';
  import CardView from './Card.svelte';

  let {
    cards,
    trump = null,
    caption = null,
    badge = null
  }: {
    cards: readonly Card[];
    trump?: TrumpModel | null;
    /** 牌堆上方的小字（真实牌局里是出牌人） */
    caption?: string | null;
    /** 牌堆下方的金色徽标（如「庄 +20 分」：这墩分归哪一方） */
    badge?: string | null;
  } = $props();
</script>

<!-- 一家的出牌堆：桌面与 /rules 教程共用，别在教程里重画一份 -->
<div>
  {#if caption}
    <p class="mb-1 text-center text-[10px] text-white/45">{caption}</p>
  {/if}
  <div class="cluster drop-in">
    {#each cards as card (cardKey(card))}
      <CardView {card} {trump} size="sm" />
    {/each}
  </div>
  {#if badge}
    <p class="mt-1 text-center">
      <span class="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-ink shadow">{badge}</span>
    </p>
  {/if}
</div>
