<script lang="ts">
  import { levelLabel } from '@sixty/engine';
  import type { TableClient } from '$lib/client/table.svelte';

  /**
   * 请机器人离座确认。与 `LeaveConfirm` 同理**必须挂在页面级**：
   * 抽屉靠 `translate-x` 位移，任何 transform 都会成为 `fixed` 后代的包含块，
   * 弹窗塞进抽屉就会被限制在 22rem 里。
   *
   * 文案对齐人类离座那份（本副会停在空座上等补位）—— 机器人走了是同一件领域事实。
   */
  let {
    client,
    seat = null,
    name = null,
    onClose
  }: { client: TableClient; seat?: number | null; name?: string | null; onClose?: () => void } = $props();

  const level = $derived(seat === null ? null : (client.view?.levels[seat] ?? null));
  const dealInPlay = $derived(client.view?.deal != null && client.view.deal.phase !== 'scored');

  const ghost = 'rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10';

  async function remove(): Promise<void> {
    if (seat === null) return;
    if (await client.removeBot(seat)) onClose?.();
  }
</script>

{#if seat !== null}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <div class="w-[22rem] max-w-[94vw] rounded-2xl bg-felt-800 p-4 ring-1 ring-gold/30 sm:p-5">
      <h2 class="text-sm font-bold">请「{name ?? '机器人'}」离座？</h2>
      <ul class="mt-3 space-y-1.5 text-xs leading-relaxed text-white/70">
        <li>
          座位空出后，{level === null ? '该座位的级别' : `这个座位的级别 ${levelLabel(level)}`}与当前手牌由下一位入座者（人或机器人）继承。
        </li>
        {#if dealInPlay}
          <li>这一副正在进行：会停在空座上，等有人补位再继续。</li>
        {:else}
          <li>这一副没在打，空座随时可以坐人，也可以再点「+ 机器人」。</li>
        {/if}
      </ul>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class={ghost} onclick={() => onClose?.()}>取消</button>
        <button
          type="button"
          class="rounded-md bg-gold px-4 py-1 text-xs font-bold text-ink transition hover:brightness-110 disabled:opacity-40"
          disabled={client.busy}
          onclick={() => void remove()}
        >
          确认请离
        </button>
      </div>
      {#if client.error}
        <p class="mt-2 rounded-lg bg-red-500/20 px-3 py-1 text-xs text-red-200">{client.error}</p>
      {/if}
    </div>
  </div>
{/if}
