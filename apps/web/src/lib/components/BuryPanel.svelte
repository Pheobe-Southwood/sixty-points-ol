<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import CardView from './Card.svelte';

  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const mine = $derived(view?.you.isDeclarer ?? false);
  const chosen = $derived(client.selectedCards);
</script>

<!-- 这里不再放第二个「?」：埋底阶段的说明统一由操作条的「?」给出（与 /rules 同源），
     同一个阶段出现两个问号只是重复。 -->
<section class="absolute inset-x-0 top-[14%] mx-auto w-[21rem] max-w-[92%]">
  <h2 class="text-sm font-bold">
    埋底
    {#if mine}
      <span class="ml-1 font-normal text-[11px] text-white/50">选 3 张扣入暗底</span>
    {/if}
  </h2>

  <div class="mt-4 flex justify-center gap-2">
    {#each [0, 1, 2] as index (index)}
      <div class="slot" class:filled={chosen[index] !== undefined}>
        {#if chosen[index]}
          <CardView card={chosen[index]!} trump={deal?.trump ?? null} size="sm" />
        {:else}
          ✦
        {/if}
      </div>
    {/each}
  </div>
</section>
