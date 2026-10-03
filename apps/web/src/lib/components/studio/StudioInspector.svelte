<script lang="ts">
  import { rankLabel, type Seat } from '@sixty/engine';
  import { copyText } from '$lib/clipboard';
  import type { StudioState } from '$lib/story/studio.svelte.ts';

  let { studio }: { studio: StudioState } = $props();

  const SEATS: readonly Seat[] = [0, 1, 2];
  const panel = 'rounded-2xl bg-black/25 p-3 ring-1 ring-white/10';
  const label = 'block text-[10px] text-white/45';
  const input =
    'w-full rounded-lg bg-black/40 px-2 py-1.5 text-[11px] text-ivory outline-none ring-1 ring-white/15 transition focus:ring-gold';
  const btn = 'rounded-lg px-2.5 py-1.5 text-[11px] ring-1 transition hover:bg-white/10 disabled:opacity-40';

  let newSeed = $state('');
  let exportText = $state('');
  let exportErrors = $state<readonly string[]>([]);
  let copied = $state(false);
  let showJson = $state(false);

  function seedChanged(): void {
    const next = newSeed.trim();
    if (next.length === 0) return;
    studio.restart({
      seed: next,
      dealerSeat: studio.spec.dealerSeat,
      levels: studio.spec.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
    });
    newSeed = '';
  }

  function runExport(): { json: string; errors: readonly string[] } {
    const result = studio.exportJson();
    exportErrors = result.errors;
    exportText = result.json;
    return result;
  }

  async function copyJson(): Promise<void> {
    const { json } = runExport();
    if (json.length === 0) return;
    copied = await copyText(json);
    if (copied) setTimeout(() => (copied = false), 1600);
  }

  function downloadJson(): void {
    const { json } = runExport();
    if (json.length === 0) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${studio.meta.slug.length > 0 ? studio.meta.slug : 'deal'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="grid gap-3">
  <section class={panel}>
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-bold text-ivory">这副牌</h2>
      <button type="button" class={btn} onclick={() => studio.newDraft()}>新建 / 换一副</button>
    </div>
    <div class="mt-2 grid gap-2">
      <label class={label}>
        标题
        <input
          class={['mt-1', input]}
          value={studio.meta.title}
          oninput={(event) => studio.setMeta('title', event.currentTarget.value)}
          onblur={() => studio.endEdit()}
        />
      </label>
      <label class={label}>
        slug（导出文件名）
        <input
          class={['mt-1 font-mono', input]}
          value={studio.meta.slug}
          oninput={(event) => studio.setMeta('slug', event.currentTarget.value)}
          onblur={() => studio.endEdit()}
        />
      </label>
      <div>
        <p class={label}>三家名字 · 级别</p>
        <div class="mt-1 grid gap-1">
          {#each SEATS as seat (seat)}
            <div class="flex items-center gap-1.5">
              <input
                class={input}
                value={studio.meta.names[seat]}
                maxlength={8}
                oninput={(event) => {
                  const names = [...studio.meta.names] as [string, string, string];
                  names[seat] = event.currentTarget.value;
                  studio.setNames(names);
                }}
                onblur={() => studio.endEdit()}
              />
              <span class="shrink-0 text-[10px] text-white/40">
                {rankLabel(studio.spec.levels[seat]?.rank ?? 2)}(+{studio.spec.levels[seat]?.cycle ?? 0})
              </span>
            </div>
          {/each}
        </div>
      </div>
      <div class="flex items-end gap-1.5">
        <label class={['flex-1', label]}>
          换种子重开（丢掉全部动作与说明）
          <input class={['mt-1 font-mono', input]} bind:value={newSeed} placeholder={studio.spec.seed} />
        </label>
        <button type="button" class={[btn, 'shrink-0']} disabled={newSeed.trim().length === 0} onclick={seedChanged}>
          重开
        </button>
      </div>
      <label class={label}>
        开篇（可选）
        <textarea
          class={['mt-1', input, 'h-16 resize-y']}
          value={studio.meta.intro}
          placeholder="这一副是什么局面、要讲什么"
          oninput={(event) => studio.setMeta('intro', event.currentTarget.value)}
          onblur={() => studio.endEdit()}
        ></textarea>
      </label>
      <label class={label}>
        收尾（可选）
        <textarea
          class={['mt-1', input, 'h-16 resize-y']}
          value={studio.meta.outro}
          placeholder="这一副的结论、留给读者的一句话"
          oninput={(event) => studio.setMeta('outro', event.currentTarget.value)}
          onblur={() => studio.endEdit()}
        ></textarea>
      </label>
    </div>
  </section>

  <section class={panel}>
    <h2 class="text-sm font-bold text-ivory">进度</h2>
    <div class="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-white/60">
      <span>动作 <b class="text-ivory">{studio.stats.steps}</b> 步</span>
      <span>已完成 <b class="text-ivory">{studio.stats.tricks}</b> 墩</span>
      <span>已写说明 <b class="text-ivory">{studio.stats.noted}</b> 条</span>
      <span>{studio.stats.complete ? '已打完' : '未打完'}</span>
    </div>
    {#if studio.problems.length > 0}
      <ul class="mt-2 space-y-0.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-200 ring-1 ring-amber-400/25">
        {#each studio.problems as problem (problem)}
          <li>· {problem}</li>
        {/each}
      </ul>
    {/if}
    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <button type="button" class={btn} disabled={!studio.canUndo} onclick={() => studio.undo()}>撤销</button>
      <button type="button" class={btn} disabled={!studio.canRedo} onclick={() => studio.redo()}>重做</button>
      {#if studio.previewing}
        <button type="button" class={btn} onclick={() => (studio.previewIndex = null)}>回到最新</button>
      {/if}
    </div>
    <p class="mt-2 text-[10px] text-white/35">
      {studio.storageAvailable ? '每一步都自动存在本机浏览器里。' : '本机存不了，请随时导出 JSON。'}
      {#if studio.storageProblem !== null}
        <span class="text-amber-200">{studio.storageProblem}</span>
      {/if}
    </p>
  </section>

  <section class={panel}>
    <h2 class="text-sm font-bold text-ivory">导出</h2>
    <p class="mt-1 text-[10px] leading-relaxed text-white/45">
      导出的 JSON 是最终交付物：牌面 + 动作 + 你的说明 + 引擎算出的结算。把这一个文件给我就行。
    </p>
    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        class="rounded-lg bg-gold px-3 py-1.5 text-[11px] font-bold text-ink transition hover:brightness-110"
        onclick={() => void copyJson()}>复制 JSON</button
      >
      <button type="button" class={btn} onclick={downloadJson}>下载 {studio.meta.slug || 'deal'}.json</button>
      <button type="button" class={btn} onclick={() => { runExport(); showJson = !showJson; }}>
        {showJson ? '收起' : '预览'}
      </button>
      {#if copied}
        <span class="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] text-emerald-200">已复制</span>
      {/if}
    </div>
    {#if exportErrors.length > 0}
      <ul class="mt-2 space-y-0.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[10px] text-rose-200 ring-1 ring-rose-400/25">
        {#each exportErrors as error (error)}
          <li>· {error}</li>
        {/each}
      </ul>
    {/if}
    {#if showJson && exportText.length > 0}
      <textarea class={['mt-2 h-48 w-full resize-y rounded-lg bg-black/50 p-2 font-mono text-[10px] text-white/70', 'outline-none ring-1 ring-white/15'].join(' ')} readonly value={exportText}></textarea>
    {/if}
    <p class="mt-2 text-[10px] text-white/35">
      没打完也能导出（只能当草稿备份）；下游网页只接受打完的牌局。用浏览器打开本地文件不方便时，直接复制粘贴也一样。
    </p>
  </section>
</div>
