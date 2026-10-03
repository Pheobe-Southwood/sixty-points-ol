<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    children,
    label = '?'
  }: { title: string; children: Snippet; label?: string } = $props();

  let open = $state(false);
</script>

<div class="relative">
  <button
    type="button"
    class="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-xs font-bold text-white/70 ring-1 ring-white/15 transition hover:bg-white/20"
    title={title}
    aria-expanded={open}
    onclick={(event) => {
      event.stopPropagation();
      open = !open;
    }}>{label}</button
  >

  {#if open}
    <div
      class="absolute right-0 top-8 z-40 w-80 max-w-[80vw] rounded-xl bg-black/90 p-4 text-left text-xs leading-relaxed text-white/80 ring-1 ring-white/15 backdrop-blur"
      role="dialog"
      aria-label={title}
    >
      <p class="mb-2 text-sm font-bold text-ivory">{title}</p>
      {@render children()}
    </div>
  {/if}
</div>

<svelte:window onclick={() => (open = false)} />
