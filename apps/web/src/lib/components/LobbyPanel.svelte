<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import InviteCode from './InviteCode.svelte';

  let { client, code }: { client: TableClient; code: string } = $props();

  const table = $derived(client.table);
  const seats = $derived(table?.seats ?? []);
  const ready = $derived(table?.ready ?? false);
  /** 在座的人才能开局；观战者只能等（入座按钮在页头） */
  const seated = $derived(client.you !== null);
  const missing = $derived(3 - seats.filter((seat) => seat.userId !== null).length);
</script>

<section class="absolute inset-0 grid place-items-center px-4">
  <div class="text-center">
    <p class="text-[10px] tracking-[.4em] text-gold/70 sm:text-[11px]">SIXTY POINTS</p>
    <h1
      class="mt-1 text-4xl font-black tracking-[.2em] text-ivory drop-shadow-[0_2px_20px_rgba(0,0,0,.5)] sm:text-5xl"
    >
      六十分
    </h1>

    <!-- 点邀请码即复制邀请链接；不写阶段说明（那在左下的「?」里） -->
    <p class="mt-4 text-xs text-white/60">点邀请码即可复制邀请链接，发给朋友：</p>
    <div class="mt-1.5 flex justify-center">
      <InviteCode {code} class="font-mono text-lg font-bold tracking-[.3em] text-gold" />
    </div>

    <div class="mt-4 flex flex-wrap justify-center gap-1.5 text-[11px]">
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

    {#if seated}
      <button
        type="button"
        class="mt-5 rounded-xl bg-gold px-8 py-2.5 text-sm font-bold text-ink shadow-[0_6px_20px_-6px_rgba(216,180,90,.7)] transition hover:brightness-110 active:scale-95 disabled:opacity-40"
        disabled={!ready || client.busy}
        onclick={() => void client.deal()}
      >
        {ready ? '开始第一副' : `还差 ${missing} 人`}
      </button>
    {:else}
      <p class="mt-5 text-xs text-white/60">
        {ready ? '你在观战：等他们发牌；有空位时可以点页头「入座」补上。' : `你在观战 · 还差 ${missing} 人`}
      </p>
    {/if}

    <p class="mt-3">
      <a class="text-[11px] text-white/45 hover:text-white" href="/rules">第一次玩？看新手教程 →</a>
    </p>

    {#if client.error}
      <p class="mt-2 rounded-lg bg-red-500/20 px-3 py-1 text-xs text-red-200">{client.error}</p>
    {/if}
  </div>
</section>
