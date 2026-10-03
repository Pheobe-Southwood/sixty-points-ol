<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';

  let { client, code }: { client: TableClient; code: string } = $props();

  const table = $derived(client.table);
  const seats = $derived(table?.seats ?? []);
  const seated = $derived(table?.seatedCount ?? 0);
  const ready = $derived(table?.ready ?? false);
</script>

<section class="absolute inset-0 grid place-items-center px-4">
  <div class="text-center">
    <p class="text-[10px] tracking-[.4em] text-gold/70 sm:text-[11px]">SIXTY POINTS</p>
    <h1
      class="mt-1 text-4xl font-black tracking-[.2em] text-ivory drop-shadow-[0_2px_20px_rgba(0,0,0,.5)] sm:text-5xl"
    >
      六十分
    </h1>
    <p class="mt-4 text-xs text-white/60">
      把邀请码 <b class="font-mono tracking-[.3em] text-gold">{code}</b> 发给朋友，三人到齐即可开局
    </p>

    <p class="mt-3 text-xs font-semibold text-white/70">已入座 {seated}/3</p>

    <div class="mt-3 flex flex-wrap justify-center gap-1.5 text-[11px]">
      {#each seats as seat (seat.seat)}
        <span
          class={[
            'flex items-center gap-1.5 rounded-full px-3 py-1 ring-1',
            seat.userId === null ? 'bg-black/20 text-white/35 ring-white/5' : 'bg-black/30 ring-white/10'
          ]}
        >
          <span class={['h-2 w-2 rounded-full', seat.online ? 'bg-emerald-400' : 'bg-slate-500']}></span>
          {seat.name ?? '空座'}
        </span>
      {/each}
    </div>

    <button
      type="button"
      class="mt-5 rounded-xl bg-gold px-8 py-2.5 text-sm font-bold text-ink shadow-[0_6px_20px_-6px_rgba(216,180,90,.7)] transition hover:brightness-110 active:scale-95 disabled:opacity-40"
      disabled={!ready || client.busy}
      onclick={() => void client.deal()}
    >
      {ready ? '开始第一副' : `还差 ${3 - seated} 人`}
    </button>

    {#if client.error}
      <p class="mt-2 rounded-lg bg-red-500/20 px-3 py-1 text-xs text-red-200">{client.error}</p>
    {/if}
  </div>
</section>
