<script lang="ts">
  import { cardKey, type Card, type TrumpModel } from '@sixty/engine';
  import { checkPlay, trumpText } from '$lib/labels';
  import HandFan from './HandFan.svelte';
  import TrickCluster from './TrickCluster.svelte';

  let {
    title,
    task,
    hand,
    trump,
    lead = null
  }: {
    title: string;
    task: string;
    hand: readonly Card[];
    trump: TrumpModel;
    /** null = 由你领出 */
    lead?: readonly Card[] | null;
  } = $props();

  let selected = $state<string[]>([]);

  const selectedCards = $derived(hand.filter((card) => selected.includes(cardKey(card))));
  const verdict = $derived(checkPlay({ hand, trump, lead }, selectedCards));

  function toggle(card: Card): void {
    const key = cardKey(card);
    selected = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
  }

  const selectedCount = $derived(selectedCards.length);
</script>

<!-- 教程里的练手题：用的是牌桌同一套 HandFan / Card / 合法性判定（checkPlay → 引擎 validateLead/validateFollow） -->
<section class="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10">
  <h3 class="text-sm font-bold text-ivory">{title}</h3>
  <p class="mt-1 text-[11px] leading-relaxed text-white/55">{task}</p>
  <!-- 每个练手题都标出将牌环境：不写这句，读者没法判断哪几张算连牌 -->
  <p class="mt-1 text-[11px] text-gold/70">本副：{trumpText(trump)}（金边 = 主牌）</p>

  {#if lead !== null && lead !== undefined}
    <div class="mt-3 flex items-end gap-3">
      <p class="pb-6 text-[10px] text-white/45">上家领出</p>
      <TrickCluster cards={lead} {trump} />
    </div>
  {/if}

  <div class="mt-3 rounded-xl bg-black/25 px-2 py-3">
    <HandFan {hand} {trump} selected={selected} selectable onToggle={toggle} />
  </div>

  <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
    <p class="text-[11px]">
      {#if selectedCount === 0}
        <span class="text-white/45">点选牌面试试看，已选 0 张</span>
      {:else if verdict === null}
        <span class="font-semibold text-emerald-300">✓ 合法：{selectedCount} 张</span>
      {:else}
        <span class="font-semibold text-rose-300">✗ {verdict}</span>
      {/if}
    </p>
    <button
      type="button"
      class="rounded-lg border border-white/20 px-3 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40"
      disabled={selectedCount === 0}
      onclick={() => (selected = [])}
    >
      清空
    </button>
  </div>
</section>
