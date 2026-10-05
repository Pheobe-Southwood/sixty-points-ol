<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { TableClient } from '$lib/client/table.svelte';

  /**
   * 页头右上角的**桌况簇**：观战人数 + 一步动作。
   *
   * 为什么回到页头：观战人数、离座、改名、入座都是「看一眼 / 点一下」的东西 —— 埋在抽屉的
   * 「牌桌」页里时，想离座得先开抽屉再找按钮。页头爆满的根因是往里堆**查阅**入口（战报、教程、
   * 历史记录），而这一簇是**有界**的：一枚人数 + 至多两枚小按钮，宽度不随人的多少变化
   * （人数含 0 常显，所以 0 → 1 也不会让右侧横跳一下）。
   *
   * 三态：
   * - 在座：`离座` —— 确认弹窗挂在页面级（抽屉的 transform 会困住 fixed 弹窗）
   * - 不在座：`改名`（开抽屉的「牌桌」页：表单要输入框，页头放不下）+ 有空座时 `入座`
   * - 满座且不在座：只剩人数与改名（补位有时限，所以「入座」从不藏起来 —— 没有空座时才没有它）
   */
  let {
    client,
    onLeave,
    onRename
  }: { client: TableClient; onLeave?: () => void; onRename?: () => void } = $props();

  const seats = $derived(client.table?.seats ?? []);
  const seated = $derived(client.you !== null);
  const free = $derived(seats.some((seat) => seat.userId === null));
  /** 口径是「正在看」的实时连接数，不是观战记录条数（见 CONTEXT.md 的 观战者） */
  const watchCount = $derived(client.table?.spectatorCount ?? 0);

  const gold =
    'rounded-md bg-gold px-2.5 py-0.5 text-[11px] font-bold text-ink transition hover:brightness-110 disabled:opacity-40';
  const ghost =
    'rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10';

  async function sit(): Promise<void> {
    if (await client.sit()) await invalidateAll();
  }
</script>

<span class="text-white/45" data-watch-count="true">{watchCount} 人观战</span>

{#if seated}
  <button type="button" class={ghost} onclick={() => onLeave?.()}>离座</button>
{:else}
  <button type="button" class={ghost} onclick={() => onRename?.()}>改名</button>
  {#if free}
    <button type="button" class={gold} disabled={client.busy} onclick={() => void sit()}>入座</button>
  {/if}
{/if}
