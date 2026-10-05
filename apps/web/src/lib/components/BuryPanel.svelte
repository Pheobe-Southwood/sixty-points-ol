<script lang="ts">
  import { cardKey } from '@sixty/engine';
  import type { TableClient } from '$lib/client/table.svelte';
  import CardView from './Card.svelte';

  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  /** 观战者永远不是庄家：只看到三个空的暗底槽 */
  const mine = $derived(client.you?.isDeclarer ?? false);
  const chosen = $derived(client.selectedCards);
  /** 发牌留下的 3 张：只有庄家拿得到（闲家是 null，观战者连 you 都没有），见引擎 personalView */
  const taken = $derived(client.you?.originalKitty ?? []);
  const isChosen = (index: number): boolean => chosen[index] !== undefined;
</script>

<!-- 这一块**不自带定位**：牌桌页把它和阶段状态条放进同一个绝对定位的列容器，
     槽位永远排在状态条下面（早先两者各自绝对定位，手机短屏上「定约」会压到槽位上）。
     也不再有标题行（「埋底 · 选 3 张扣入暗底 / 庄家埋底中」）与底牌说明句：
     阶段说明统一由「?」给出（与 /rules 同源），动作提示由动作托盘（`ActionTray`）的
     「已选 X / 3」给出，这里写第二遍只是重复。
     但**整体让开点击**（`pointer-events-none`）：它与状态条同处一个横跨整幅的层，
     窄桌面（~640px）上正好压在左右两张座位卡的动作按钮（「+ 机器人」/「请离」）上 ——
     只有里面那行「拿上来的底牌」是可点的，单独把它接回来。 -->
<section class="pointer-events-none w-[21rem] max-w-[92%]">
  {#if mine}
    <!-- 拿上来的底牌单独摆一行，并且**可以点**：底牌并进 20 张手牌后按花色排序，
         再想从手牌里认出是哪三张几乎不可能。点这里等于在手牌里选中它（同一个选中集合）。
         蓝框与手牌里那三张的蓝描边是同一套标记，不必再用一句话解释。 -->
    <div data-taken-kitty="true" class="pointer-events-auto rounded-xl bg-black/35 p-2 ring-1 ring-sky-300/25">
      <div class="flex justify-center gap-2">
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
