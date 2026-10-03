<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import CardView from './Card.svelte';
  import HelpPopover from './HelpPopover.svelte';
  import { seatLabel } from '$lib/labels';

  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const mine = $derived(view?.you.isDeclarer ?? false);
  const chosen = $derived(client.selectedCards);
</script>

<section class="absolute inset-x-0 top-[14%] mx-auto w-[21rem] max-w-[92%]">
  <div class="flex items-center justify-between gap-2">
    <h2 class="text-sm font-bold">
      埋底
      <span class="ml-1 font-normal text-[11px] text-white/50">
        {mine ? '选 3 张扣入暗底' : `等待 ${seatLabel(deal?.declarerSeat ?? 0)}家埋底…`}
      </span>
    </h2>
    <HelpPopover title="埋底规则">
      <ul class="list-disc space-y-1.5 pl-4">
        <li>庄家从 20 张手牌中扣 3 张为<b>暗底</b>，其他两家看不见，结算时才翻开。</li>
        <li>可以埋分牌（5 / 10 / K）。底分不丢：按 <b class="text-gold">末轮张数 ×</b> 结算给末轮赢家。</li>
      </ul>
      <div class="mt-2.5 space-y-2 rounded-lg bg-white/5 p-2.5">
        <p>
          <b class="text-emerald-300">保底</b>：你埋了 ♥5 ♦5（10 分），末轮每人出 2 张、<b>你</b>赢下末轮 →
          10 × 2 = <b class="text-emerald-300">+20</b> 计入总分。
        </p>
        <p>
          <b class="text-rose-300">抠底</b>：同样 10 分底，末轮被<b>闲家</b>赢走 → 10 × 2 =
          <b class="text-rose-300">−20</b>，从你的总分里扣（可扣成负数）。
        </p>
      </div>
      <p class="mt-2.5 text-white/50">埋多少分、留多少牌护底，是庄家的核心博弈。</p>
    </HelpPopover>
  </div>

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
