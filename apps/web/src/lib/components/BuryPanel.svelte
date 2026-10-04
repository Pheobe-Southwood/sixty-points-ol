<script lang="ts">
  import { cardKey } from '@sixty/engine';
  import type { TableClient } from '$lib/client/table.svelte';
  import CardView from './Card.svelte';

  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  /** 观战者永远不是庄家：只看到「庄家埋底中」与三个空的暗底槽 */
  const mine = $derived(client.you?.isDeclarer ?? false);
  const chosen = $derived(client.selectedCards);
  /** 发牌留下的 3 张：只有庄家拿得到（闲家是 null，观战者连 you 都没有），见引擎 personalView */
  const taken = $derived(client.you?.originalKitty ?? []);
  const isChosen = (index: number): boolean => chosen[index] !== undefined;
</script>

<!-- 这里不再放第二个「?」：埋底阶段的说明统一由操作条的「?」给出（与 /rules 同源），
     同一个阶段出现两个问号只是重复。
     根节点让开点击（`pointer-events-none`）：这层横跨整幅毡面，会把**座位卡上的动作按钮**
     （「+ 机器人」/「请离」）盖住 —— 窄屏上尤其明显（`top-[12%]` 就在上排座位卡的按钮带上）。
     只有里面那张「拿上来的底牌」是可点的，单独把它接回来。 -->
<section class="pointer-events-none absolute inset-x-0 top-[12%] mx-auto w-[21rem] max-w-[92%]">
  <h2 class="text-sm font-bold">
    埋底
    {#if mine}
      <span class="ml-1 font-normal text-[11px] text-white/50">选 3 张扣入暗底</span>
    {:else}
      <span class="ml-1 font-normal text-[11px] text-white/50">庄家埋底中</span>
    {/if}
  </h2>

  {#if mine}
    <!-- 拿上来的底牌单独摆一行，并且**可以点**：底牌并进 20 张手牌后按花色排序，
         再想从手牌里认出是哪三张几乎不可能。点这里等于在手牌里选中它（同一个选中集合）。 -->
    <div class="pointer-events-auto mt-2 rounded-xl bg-black/35 p-2 ring-1 ring-sky-300/25">
      <p class="text-[11px] text-white/60">你拿上来的底牌（点一下 = 在手牌里选中它）</p>
      <div class="mt-1.5 flex justify-center gap-2">
        {#each taken as card, index (cardKey(card) + index)}
          {@const on = client.selected.includes(cardKey(card))}
          <button
            type="button"
            class="rounded-lg p-1 transition hover:bg-white/10"
            aria-pressed={on}
            aria-label={`底牌 ${index + 1}`}
            onclick={() => client.toggle(card)}
          >
            <CardView {card} trump={deal?.trump ?? null} size="sm" selected={on} marked />
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="mt-3 flex justify-center gap-2">
    {#each [0, 1, 2] as index (index)}
      <div class="slot" class:filled={isChosen(index)}>
        {#if chosen[index]}
          <CardView card={chosen[index]!} trump={deal?.trump ?? null} size="sm" />
        {:else}
          ✦
        {/if}
      </div>
    {/each}
  </div>
</section>
