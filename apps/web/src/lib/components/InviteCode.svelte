<script lang="ts">
  import { copyText } from '$lib/clipboard';
  import { inviteUrl } from '$lib/invite';

  let {
    code,
    class: klass = '',
    label = null
  }: { code: string; class?: string; label?: string | null } = $props();

  let copied = $state(false);
  /** 自动复制失败（手机走 http://192.168.x.x 时没有 Clipboard API）才出现的兜底链接 */
  let fallback = $state<string | null>(null);
  let fallbackEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (fallback !== null) {
      fallbackEl?.focus();
      fallbackEl?.select();
    }
  });

  async function copy(): Promise<void> {
    if (typeof location === 'undefined') return;
    const url = inviteUrl(location.origin, code);
    if (await copyText(url)) {
      fallback = null;
      copied = true;
      setTimeout(() => (copied = false), 1600);
      return;
    }
    copied = false;
    fallback = url;
  }
</script>

<div class="relative inline-flex items-center gap-1.5">
  <button
    type="button"
    class={['cursor-copy transition hover:brightness-110', klass]}
    title="点击复制邀请链接"
    aria-label="复制邀请链接"
    onclick={(event) => {
      event.stopPropagation();
      void copy();
    }}>{label ?? code}</button
  >

  {#if copied}
    <span
      class="rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40"
      >已复制链接</span
    >
  {/if}

  {#if fallback}
    <div
      class="absolute left-0 top-8 z-40 w-72 max-w-[85vw] rounded-xl bg-black/90 p-3 text-left ring-1 ring-white/15 backdrop-blur"
    >
      <p class="text-[11px] text-white/70">当前浏览器不允许自动复制，请手动复制链接：</p>
      <input
        readonly
        bind:this={fallbackEl}
        value={fallback}
        class="mt-1.5 w-full rounded-md bg-black/50 px-2 py-1 font-mono text-[11px] text-white/80 ring-1 ring-white/15"
        onclick={(event) => event.stopPropagation()}
      />
    </div>
  {/if}
</div>

<svelte:window onclick={() => (fallback = null)} />
