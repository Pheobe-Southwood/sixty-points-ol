<script lang="ts">
  import { onMount } from 'svelte';
  import StepList from '$lib/components/studio/StepList.svelte';
  import StudioInspector from '$lib/components/studio/StudioInspector.svelte';
  import StudioSetup from '$lib/components/studio/StudioSetup.svelte';
  import StudioTable from '$lib/components/studio/StudioTable.svelte';
  import { StudioState } from '$lib/story/studio.svelte.ts';

  /**
   * 牌局编排台：作者自己的工具，不在玩家流程里挂链接（线上靠 URL 打开）。
   *
   * 全部跑在本地：种子 → 牌局走引擎纯函数，草稿存浏览器，导出 JSON。
   * 服务端不参与，所以没有新接口、没有新表、也没有需要鉴权的东西。
   */
  const studio = new StudioState();

  onMount(() => studio.load());

  /** 撤销/重做：在输入框里打字时不劫持（那里交给浏览器自己的撤销） */
  function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true) return;
    if (!event.metaKey && !event.ctrlKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) studio.redo();
      else studio.undo();
    } else if (key === 'y') {
      event.preventDefault();
      studio.redo();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<main class="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6">
  <header>
    <a class="text-xs text-white/50 hover:text-white" href="/">← 大厅</a>
    <h1 class="mt-2 text-2xl font-black tracking-wide text-ivory">牌局编排台</h1>
    <p class="mt-1 max-w-3xl text-xs leading-relaxed text-white/55">
      给「规则演示」喂牌局用的：输入种子生成一副牌，<b class="text-ivory">三家都由你出</b>，每一步旁边随手写说明，
      最后导出一个 JSON。牌面、赢家、墩分、结算都由引擎现算，你只写「为什么」。
    </p>
  </header>

  {#if studio.draftId === null}
    <StudioSetup {studio} />
  {:else}
    <div class="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,19rem)]">
      <StepList {studio} />
      <StudioTable {studio} />
      <StudioInspector {studio} />
    </div>
  {/if}
</main>
