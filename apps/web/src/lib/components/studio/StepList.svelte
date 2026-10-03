<script lang="ts">
  import type { StudioState } from '$lib/story/studio.svelte.ts';

  let { studio }: { studio: StudioState } = $props();

  const area =
    'mt-1.5 w-full resize-y rounded-lg bg-black/40 p-2 text-[11px] leading-relaxed text-ivory outline-none ring-1 ring-white/10 transition placeholder:text-white/25 focus:ring-gold';
  const miniBtn = 'rounded-md px-1.5 py-0.5 text-[10px] text-white/45 ring-1 ring-white/10 hover:bg-white/10';

  let listEl = $state<HTMLDivElement | null>(null);
  let lastCount = 0;

  // 新落一步就滚到底：连续出牌时不必手动找位置
  $effect(() => {
    const count = studio.actions.length;
    if (count !== lastCount) {
      lastCount = count;
      queueMicrotask(() => {
        if (listEl !== null) listEl.scrollTop = listEl.scrollHeight;
      });
    }
  });

  const noted = $derived(studio.rows.filter((row) => row.note.trim().length > 0).length);
</script>

<section class="flex min-h-0 flex-col rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
  <div class="flex items-baseline justify-between">
    <h2 class="text-sm font-bold text-ivory">步骤与说明</h2>
    <span class="text-[10px] text-white/45">{noted} / {studio.rows.length} 步已写说明</span>
  </div>
  <p class="mt-1 text-[10px] leading-relaxed text-white/40">
    牌面、赢家、墩分、张数都由引擎现算（灰色标签），你只写「为什么」。撤销只针对动作，说明框里用 Ctrl/⌘+Z 撤自己的打字。
  </p>

  <div class="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5 lg:max-h-[70vh]" bind:this={listEl}>
    {#if studio.rows.length === 0}
      <p class="rounded-lg bg-black/30 px-3 py-2 text-[11px] text-white/45">这副牌还没有发牌。</p>
    {/if}

    {#each studio.rows as row, index (row.index)}
      {#if index === 0 || studio.rows[index - 1]?.groupKey !== row.groupKey}
        <p class="pt-1 text-[10px] font-semibold tracking-wider text-gold/70">{row.groupLabel}</p>
      {/if}

      <div
        class={[
          'rounded-xl bg-black/30 p-2.5 ring-1 transition',
          studio.previewIndex === row.index ? 'ring-gold' : 'ring-white/5'
        ]}
      >
        <div class="flex items-start gap-2">
          <span class="w-5 shrink-0 pt-0.5 text-right text-[10px] tabular-nums text-white/30">{row.index + 1}</span>
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-semibold text-ivory">{row.annotation.headline}</p>
            {#if row.annotation.tags.length > 0}
              <p class="mt-1 flex flex-wrap gap-1">
                {#each row.annotation.tags as tag (tag)}
                  <span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/55">{tag}</span>
                {/each}
              </p>
            {/if}
            <textarea
              class={area}
              rows="2"
              value={row.note}
              placeholder={row.step.kind === 'play' ? '这一手为什么这样出…' : '这一步的用意…'}
              oninput={(event) => studio.setNote(row.index, event.currentTarget.value)}
              onblur={() => studio.endEdit()}
            ></textarea>
          </div>
          <div class="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              class={miniBtn}
              title="回看这一手之后的牌面"
              onclick={() => (studio.previewIndex = row.index)}>看</button
            >
            {#if studio.previewIndex === row.index}
              <button type="button" class={miniBtn} onclick={() => (studio.previewIndex = null)}>最新</button>
            {/if}
            {#if index > 0}
              <button
                type="button"
                class={miniBtn}
                title="丢掉这一步及其之后（可撤销）"
                onclick={() => studio.truncateAt(row.index)}>重打</button
              >
            {/if}
          </div>
        </div>

        {#if row.showTrickBox && row.trick !== null}
          <div class="mt-2 rounded-lg bg-black/40 p-2">
            <p class="text-[10px] text-gold/70">
              第 {row.trick.ordinal + 1} 墩小结（可选）
              {#if studio.trickAnnotations.get(row.trick.ordinal) !== undefined}
                · {studio.trickAnnotations.get(row.trick.ordinal)?.headline}
              {/if}
            </p>
            <textarea
              class={area}
              rows="1"
              value={row.trickNote ?? ''}
              placeholder="这一墩的看点…"
              oninput={(event) => studio.setTrickNote(row.trick!.ordinal, event.currentTarget.value)}
              onblur={() => studio.endEdit()}
            ></textarea>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</section>
