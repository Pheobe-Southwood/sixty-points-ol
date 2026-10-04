<script lang="ts">
  import { DRAWER_TABS, type DrawerTabKey } from '$lib/drawer-tabs';

  /**
   * 右边缘的活页签条：竖排 4 个迷你页签，**常驻**。
   *
   * z-index 40/45 的分工是刻意的：抽屉 40、本页签条 45、结算与离座确认弹窗 50。
   * 于是手机全屏覆盖时页签条仍浮在抽屉之上 —— 点当前页签即可收起，是全屏态下的第二条逃生路；
   * 而每副结束自动弹出的结算弹窗（50）始终压在最上面，不会被抽屉或页签条盖住。
   */
  let {
    active = null,
    onSelect
  }: { active?: DrawerTabKey | null; onSelect?: (key: DrawerTabKey) => void } = $props();
</script>

<div
  class="fixed right-0 top-1/2 z-[45] flex -translate-y-1/2 flex-col items-end gap-1"
  role="tablist"
  aria-label="牌桌信息"
  aria-orientation="vertical"
>
  {#each DRAWER_TABS as tab (tab.key)}
    {@const on = active === tab.key}
    <button
      type="button"
      role="tab"
      id={`tab-${tab.key}`}
      aria-selected={on}
      aria-controls={`drawer-${tab.key}`}
      aria-expanded={on}
      class={[
        'rounded-l-lg border border-r-0 py-2 pl-1.5 pr-1 text-[11px] leading-none tracking-widest shadow-[0_2px_10px_-4px_rgba(0,0,0,.8)] transition',
        on
          ? 'border-gold/50 bg-gold font-bold text-ink'
          : 'border-white/15 bg-felt-950/85 text-white/70 hover:bg-felt-800'
      ]}
      onclick={() => onSelect?.(tab.key)}
    >
      <span class="[writing-mode:vertical-rl]">{tab.label}</span>
    </button>
  {/each}
</div>
