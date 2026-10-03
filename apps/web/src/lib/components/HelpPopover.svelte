<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    children,
    label = '?',
    align = 'right',
    placement = 'down',
    width = 'w-80'
  }: {
    title: string;
    children: Snippet;
    label?: string;
    /** 触发按钮贴左边缘时必须用 left：面板 320px 宽，right-0 会跑出屏幕左侧 */
    align?: 'left' | 'right';
    /** 触发按钮贴屏幕底部时（如操作栏）必须用 up，否则面板落到视口外 */
    placement?: 'up' | 'down';
    width?: string;
  } = $props();

  let open = $state(false);
</script>

<div class="relative">
  <button
    type="button"
    class="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-xs font-bold text-white/70 ring-1 ring-white/15 transition hover:bg-white/20"
    title={title}
    aria-label={title}
    aria-expanded={open}
    onclick={(event) => {
      event.stopPropagation();
      open = !open;
    }}>{label}</button
  >

  {#if open}
    <div
      class={[
        'absolute z-40 max-h-[60vh] overflow-y-auto rounded-xl bg-black/90 p-4 text-left text-xs leading-relaxed text-white/80 ring-1 ring-white/15 backdrop-blur',
        width,
        'max-w-[85vw]',
        align === 'left' ? 'left-0' : 'right-0',
        placement === 'up' ? 'bottom-8' : 'top-8'
      ]}
      role="dialog"
      aria-label={title}
    >
      <p class="mb-2 text-sm font-bold text-ivory">{title}</p>
      {@render children()}
    </div>
  {/if}
</div>

<svelte:window onclick={() => (open = false)} />
