<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { TableClient } from '$lib/client/table.svelte';

  /**
   * 入座 / 离座按钮。两个变体：
   *
   * - `sit-only`：只在页头用 —— 补位是有时限的动作（座位可能被别人占走），
   *   所以「入座」留在页头；在座或满座时页头这一处什么都不渲染。
   * - `full`：「我」页用 —— 三态齐全（入座 / 离座 / 座位已满）。离座走 `onLeave` 回调，
   *   确认弹窗挂在页面级（见 `LeaveConfirm`：抽屉的 transform 会困住 fixed 弹窗）。
   */
  let {
    client,
    variant = 'full',
    onLeave
  }: { client: TableClient; variant?: 'full' | 'sit-only'; onLeave?: () => void } = $props();

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
  {#if variant === 'full'}
    <button type="button" class={ghost} onclick={() => onLeave?.()}>离座</button>
  {/if}
{:else if free}
  <button type="button" class={gold} disabled={client.busy} onclick={() => void sit()}>入座</button>
{:else if variant === 'full'}
  <span class="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/40">座位已满</span>
{/if}
