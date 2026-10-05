<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { TableClient } from '$lib/client/table.svelte';

  /**
   * 入座 / 离座按钮（「牌桌」页用），三态齐全：入座 / 离座 / 座位已满。
   *
   * 离座走 `onLeave` 回调，确认弹窗挂在页面级（见 `LeaveConfirm`：抽屉的 transform 会困住 fixed 弹窗）。
   * 页头右上角那处是另一份（`TableHeaderActions`）：页头要的是一步动作，而本页要把「座位已满」
   * 这种**说明性**状态讲清楚（为什么现在入不了座），所以两边各有各的形状。
   */
  let { client, onLeave }: { client: TableClient; onLeave?: () => void } = $props();

  const seats = $derived(client.table?.seats ?? []);
  const seated = $derived(client.you !== null);
  const free = $derived(seats.some((seat) => seat.userId === null));

  const gold =
    'rounded-md bg-gold px-2.5 py-0.5 text-[11px] font-bold text-ink transition hover:brightness-110 disabled:opacity-40';
  const ghost = 'rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10';

  async function sit(): Promise<void> {
    if (await client.sit()) await invalidateAll();
  }
</script>

{#if seated}
  <button type="button" class={ghost} onclick={() => onLeave?.()}>离座</button>
{:else if free}
  <button type="button" class={gold} disabled={client.busy} onclick={() => void sit()}>入座</button>
{:else}
  <span class="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/40">座位已满</span>
{/if}
