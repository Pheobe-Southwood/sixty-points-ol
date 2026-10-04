<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import { SPECTATOR_LABEL_SEAT } from '$lib/role';
  import { drawerTabLabel, type DrawerTabKey } from '$lib/drawer-tabs';
  import AuctionRecord from './AuctionRecord.svelte';
  import HistoryList from './HistoryList.svelte';
  import KittyPanel from './KittyPanel.svelte';
  import MePanel from './MePanel.svelte';

  /**
   * 右侧活页签抽屉：外壳（标题 + × + 滚动区）与四页正文都在这里，`TabRail` 只负责点。
   *
   * 三条不可动摇的规则：
   * 1. **动作面不进来**：叫牌候选按钮、确认埋底、出牌按钮、每副结算弹窗都留在桌面。
   * 2. **纯手动**：不自动打开、不自动换页；SSE 每帧不改开合状态（`active` 由页面持有）。
   * 3. **「我」页常驻 DOM**：抽屉关着时它仍在 HTML 里（`hidden` + `inert`），
   *    于是「改名 / 换身份」与「座位已满」两处入口在观战页的 SSR 中始终存在。
   *    战报/叫牌/底牌按需渲染 —— 战报会随副数无限增长，没必要常驻撑大 SSR 与 DOM。
   */
  let {
    client,
    active = null,
    onClose,
    onLeave
  }: {
    client: TableClient;
    active?: DrawerTabKey | null;
    onClose?: () => void;
    onLeave?: () => void;
  } = $props();

  const open = $derived(active !== null);
  const view = $derived(client.view);
  const mySeat = $derived(client.you?.seat ?? SPECTATOR_LABEL_SEAT);
  const names = $derived((client.table?.seats ?? []).map((seat) => seat.name));
  const title = $derived(active === null ? '' : drawerTabLabel(active));

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open) onClose?.();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- 桌面端点抽屉外关闭（手机端抽屉就是全屏，不存在「外」）。用 button 而不是 div：
     非交互元素挂 onclick 会触发 svelte 的 a11y 警告，而本项目 check 是 --fail-on-warnings。 -->
{#if open}
  <button
    type="button"
    tabindex="-1"
    aria-label="关闭面板"
    class="fixed inset-0 z-30 hidden cursor-default bg-transparent sm:block"
    onclick={() => onClose?.()}
  ></button>
{/if}

<aside
  class={[
    'fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-felt-950/95 ring-1 ring-white/10 backdrop-blur transition-transform duration-200 sm:w-[22rem]',
    open ? 'translate-x-0' : 'translate-x-full'
  ]}
  inert={!open}
  aria-hidden={!open}
>
  <header class="flex items-center justify-between border-b border-white/10 py-3 pl-4 pr-4">
    <h2 class="text-sm font-semibold">{title}</h2>
    <button
      type="button"
      class="rounded-md px-2 text-lg leading-none text-white/50 hover:bg-white/10 hover:text-white"
      aria-label="关闭"
      onclick={() => onClose?.()}>×</button
    >
  </header>

  <!-- pr-10：给右边缘的页签条让出位置，正文不会压到页签下面 -->
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pr-10">
    <div
      id="drawer-me"
      role="tabpanel"
      aria-labelledby="tab-me"
      hidden={active !== 'me'}
      inert={active !== 'me'}
    >
      <MePanel {client} {onLeave} />
    </div>

    {#if active === 'report'}
      <div id="drawer-report" role="tabpanel" aria-labelledby="tab-report">
        {#if view === null}
          <p class="text-xs text-white/45">还没有完成的牌局</p>
        {:else}
          <HistoryList {view} {mySeat} {names} />
        {/if}
      </div>
    {:else if active === 'auction'}
      <div id="drawer-auction" role="tabpanel" aria-labelledby="tab-auction">
        {#if view === null}
          <p class="text-xs text-white/45">还没发牌：发牌之后才有叫牌记录。</p>
        {:else}
          <AuctionRecord {view} {mySeat} {names} heading={false} />
        {/if}
      </div>
    {:else if active === 'kitty'}
      <div id="drawer-kitty" role="tabpanel" aria-labelledby="tab-kitty">
        <KittyPanel {client} />
      </div>
    {/if}
  </div>
</aside>
