<script lang="ts">
  import { onMount } from 'svelte';
  import { rankLabel, type Level, type Seat } from '@sixty/engine';
  import { randomSeedText } from '$lib/story/rng.ts';
  import { defaultSlug, validateSetup } from '$lib/story/draft.ts';
  import type { StudioState } from '$lib/story/studio.svelte.ts';
  import type { DraftSetup } from '$lib/story/types.ts';

  let { studio }: { studio: StudioState } = $props();

  const RANKS: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const SEATS: readonly Seat[] = [0, 1, 2];

  const panel = 'rounded-2xl bg-black/25 p-4 ring-1 ring-white/10';
  const label = 'block text-[11px] text-white/45';
  const input =
    'w-full rounded-lg bg-black/40 px-2.5 py-1.5 text-xs text-ivory outline-none ring-1 ring-white/15 transition focus:ring-gold';
  const primary =
    'rounded-lg bg-gold px-4 py-2 text-xs font-bold text-ink transition hover:brightness-110 active:scale-95 disabled:opacity-40';

  let title = $state('');
  let seed = $state('');
  let slug = $state('');
  let dealerSeat = $state<Seat>(0);
  let names = $state<[string, string, string]>(['你', '阿豪', '小美']);
  let ranks = $state<[number, number, number]>([5, 5, 5]);
  let cycles = $state<[number, number, number]>([0, 0, 0]);
  let errors = $state<readonly string[]>([]);
  let importText = $state('');
  let importOpen = $state(false);

  // 随机种子只在浏览器里生成：写在初始值里会让 SSR 与客户端不一致
  onMount(() => {
    if (seed === '') seed = randomSeedText();
  });

  function start(): void {
    const finalSlug = slug.trim().length > 0 ? slug.trim() : defaultSlug(seed, title);
    const levels: Level[] = SEATS.map((seat) => ({ rank: ranks[seat] ?? 5, cycle: cycles[seat] ?? 0 }));
    const setup: DraftSetup = {
      seed: seed.trim(),
      dealerSeat,
      levels,
      names: [...names] as [string, string, string],
      title: title.trim().length > 0 ? title.trim() : '未命名牌局',
      slug: finalSlug
    };
    const found = validateSetup(setup);
    errors = found;
    if (found.length > 0) return;
    studio.start(setup);
  }

  function runImport(): void {
    if (studio.importJson(importText)) {
      importText = '';
      importOpen = false;
    }
  }
</script>

<div class="grid gap-4 lg:grid-cols-2">
  <section class={panel}>
    <h2 class="text-sm font-bold text-ivory">新建一副</h2>
    <p class="mt-1 text-[11px] leading-relaxed text-white/50">
      种子决定牌面：同一个种子 + 同样的三家级别 + 同样的发牌人 = 同一副牌。三家都由你出，
      每一步旁边都能写说明；随时可以撤销、从某一步重打。
    </p>

    <div class="mt-3 grid gap-2.5">
      <label class={label}>
        标题（这一副要讲什么）
        <input class={['mt-1', input]} bind:value={title} placeholder="例：45♥ 坐庄，先走副牌长套" />
      </label>

      <label class={label}>
        种子
        <span class="mt-1 flex gap-1.5">
          <input class={[input, 'font-mono']} bind:value={seed} placeholder="随便一串数字或字母" />
          <button
            type="button"
            class="shrink-0 rounded-lg px-2.5 text-[11px] text-white/70 ring-1 ring-white/15 hover:bg-white/10"
            onclick={() => (seed = randomSeedText())}>换一个</button
          >
        </span>
      </label>

      <label class={label}>
        slug（文件名与链接；留空则按种子生成）
        <input class={[input, 'font-mono']} bind:value={slug} placeholder={defaultSlug(seed, title)} />
      </label>

      <div>
        <p class={label}>三家：名字 · 级别（默认 5(+0)，级牌就是 5）</p>
        <div class="mt-1 grid gap-1.5">
          {#each SEATS as seat (seat)}
            <div class="flex items-center gap-1.5">
              <input class={[input, 'flex-1']} bind:value={names[seat]} maxlength={8} />
              <select class={[input, 'w-16']} bind:value={ranks[seat]}>
                {#each RANKS as rank (rank)}
                  <option value={rank}>{rankLabel(rank)}</option>
                {/each}
              </select>
              <span class="text-[11px] text-white/40">+</span>
              <input class={[input, 'w-14']} type="number" min="0" max="9" bind:value={cycles[seat]} />
            </div>
          {/each}
        </div>
      </div>

      <label class={label}>
        发牌人（每副轮换；他先叫牌）
        <select class={['mt-1', input]} bind:value={dealerSeat}>
          {#each SEATS as seat (seat)}
            <option value={seat}>{names[seat]}</option>
          {/each}
        </select>
      </label>

      {#if errors.length > 0}
        <ul class="rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200 ring-1 ring-rose-400/25">
          {#each errors as error (error)}
            <li>· {error}</li>
          {/each}
        </ul>
      {/if}

      <button type="button" class={primary} onclick={start}>发牌，开始编排</button>
    </div>
  </section>

  <div class="grid content-start gap-4">
    <section class={panel}>
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-ivory">本机草稿</h2>
        <span class="text-[10px] text-white/40">存在这台浏览器里，不上传</span>
      </div>
      {#if studio.storageProblem !== null}
        <p class="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 ring-1 ring-amber-400/25">
          {studio.storageProblem}
        </p>
      {/if}
      {#if studio.drafts.length === 0}
        <p class="mt-2 text-[11px] text-white/45">还没有草稿。</p>
      {:else}
        <ul class="mt-2 grid gap-1.5">
          {#each studio.drafts as draft (draft.id)}
            <li class="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2">
              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                onclick={() => studio.openDraft(draft)}
              >
                <span class="block truncate text-xs text-ivory">{draft.title}</span>
                <span class="mt-0.5 block text-[10px] text-white/40">
                  {draft.slug} · {draft.actions.length} 步 · {draft.updatedAt.slice(0, 16).replace('T', ' ')}
                </span>
              </button>
              <button
                type="button"
                class="shrink-0 rounded-md px-2 py-1 text-[11px] text-white/50 hover:bg-white/10 hover:text-rose-200"
                onclick={() => studio.deleteDraft(draft.id)}>删除</button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class={panel}>
      <button
        type="button"
        class="flex w-full items-center justify-between text-left"
        onclick={() => (importOpen = !importOpen)}
      >
        <span class="text-sm font-bold text-ivory">导入导出的 JSON</span>
        <span class="text-[11px] text-white/45">{importOpen ? '收起' : '展开'}</span>
      </button>
      {#if importOpen}
        <p class="mt-2 text-[11px] text-white/50">
          粘贴之前导出的 JSON，会作为一份**新草稿**加进来（原来那份不动）。
        </p>
        <textarea
          class={['mt-2 h-32 w-full rounded-lg bg-black/40 p-2 font-mono text-[10px] text-white/80 outline-none ring-1 ring-white/15 focus:ring-gold', 'resize-y']}
          bind:value={importText}
          placeholder={'{\n  "version": 1,\n  ...\n}'}
        ></textarea>
        <button
          type="button"
          class="mt-2 rounded-lg px-3 py-1.5 text-[11px] text-white/80 ring-1 ring-white/20 hover:bg-white/10 disabled:opacity-40"
          disabled={importText.trim().length === 0}
          onclick={runImport}>导入为新草稿</button
        >
      {/if}
      {#if studio.notice !== null}
        <p class="mt-2 rounded-lg bg-black/40 px-3 py-2 text-[11px] text-white/70">{studio.notice}</p>
      {/if}
    </section>
  </div>
</div>
