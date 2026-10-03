<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { levelLabel } from '@sixty/engine';
  import type { TableClient } from '$lib/client/table.svelte';

  /** 页头的入座 / 离座按钮（含离座确认）。离座是「座位让出来」，不是「离开这一桌」 */
  let { client }: { client: TableClient } = $props();

  let confirmOpen = $state(false);

  const seats = $derived(client.table?.seats ?? []);
  const seated = $derived(client.you !== null);
  const mySeat = $derived(client.you?.seat ?? null);
  const free = $derived(seats.some((seat) => seat.userId === null));
  const myLevel = $derived(mySeat === null ? null : (client.view?.levels[mySeat] ?? null));
  const dealInPlay = $derived(client.view?.deal != null && client.view.deal.phase !== 'scored');

  const gold =
    'rounded-md bg-gold px-2.5 py-0.5 text-[11px] font-bold text-ink transition hover:brightness-110 disabled:opacity-40';
  const ghost = 'rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10';

  async function leave(): Promise<void> {
    if (await client.leave()) {
      confirmOpen = false;
      await invalidateAll();
    }
  }

  async function sit(): Promise<void> {
    if (await client.sit()) await invalidateAll();
  }
</script>

{#if seated}
  <button type="button" class={ghost} onclick={() => (confirmOpen = true)}>离座</button>
{:else if free}
  <button type="button" class={gold} disabled={client.busy} onclick={() => void sit()}>入座</button>
{:else}
  <span class="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/40">座位已满</span>
{/if}

{#if confirmOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <div class="w-[22rem] max-w-[94vw] rounded-2xl bg-felt-800 p-4 ring-1 ring-gold/30 sm:p-5">
      <h2 class="text-sm font-bold">离开座位？</h2>
      <ul class="mt-3 space-y-1.5 text-xs leading-relaxed text-white/70">
        <li>你会变成这一桌的观战者，仍然看得见牌桌；刷新也不会被自动塞回座位。</li>
        <li>
          座位空出后，{myLevel === null ? '该座位的级别' : `这个座位的级别 ${levelLabel(myLevel)}`}与当前手牌由下一位入座者继承。
        </li>
        {#if dealInPlay}
          <li>这一副正在进行：会停在空座上，等有人补位再继续。</li>
        {/if}
        <li>不在座位上时才能改名字或换身份。</li>
      </ul>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class={ghost} onclick={() => (confirmOpen = false)}>取消</button>
        <button
          type="button"
          class="rounded-md bg-gold px-4 py-1 text-xs font-bold text-ink transition hover:brightness-110 disabled:opacity-40"
          disabled={client.busy}
          onclick={() => void leave()}
        >
          确认离座
        </button>
      </div>
      {#if client.error}
        <p class="mt-2 rounded-lg bg-red-500/20 px-3 py-1 text-xs text-red-200">{client.error}</p>
      {/if}
    </div>
  </div>
{/if}
