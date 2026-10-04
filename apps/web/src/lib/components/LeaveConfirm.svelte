<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { levelLabel } from '@sixty/engine';
  import type { TableClient } from '$lib/client/table.svelte';

  /**
   * 离座确认。**必须挂在页面级**，不能塞进会滑动的抽屉里：
   * 抽屉靠 `translate-x` 位移，而任何 transform 都会成为 `fixed` 后代的包含块，
   * 于是这个 `fixed inset-0` 的弹窗会被限制在 22rem 的抽屉盒子里（桌面端挤成一条）。
   * 与每副结算的 `DealSummary` 一样，它属于整页而不是某一页。
   */
  let { client, open = false, onClose }: { client: TableClient; open?: boolean; onClose?: () => void } = $props();

  const mySeat = $derived(client.you?.seat ?? null);
  const myLevel = $derived(mySeat === null ? null : (client.view?.levels[mySeat] ?? null));
  const dealInPlay = $derived(client.view?.deal != null && client.view.deal.phase !== 'scored');

  const ghost = 'rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10';

  async function leave(): Promise<void> {
    if (await client.leave()) {
      onClose?.();
      await invalidateAll();
    }
  }
</script>

{#if open}
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
        <button type="button" class={ghost} onclick={() => onClose?.()}>取消</button>
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
