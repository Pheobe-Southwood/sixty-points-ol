<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import DeckSlide from '$lib/components/deck/DeckSlide.svelte';
  import { buildDeck, slideIndexOf, type Deck } from '$lib/tutorial/deck';
  import { STORIES } from '$lib/tutorial/stories/index';

  /**
   * 规则演示页：基本概念 + 三副实战牌局，做成幻灯片那样一屏一屏走。
   *
   * 「视频感」靠四件事：自动播放、键盘翻页、两侧点击、每屏都能深链。
   * 内容分两半：概念章由 `deck.ts` 手写（示例全部复用被测试核对过的 scenarios 数据），
   * 牌局章由生成的故事数据现搭（`docs/deals/*.json` → `stories/*.ts`，页面不跑回放）。
   */
  const deck: Deck = buildDeck(STORIES);

  let { data }: { data: { slide: string } } = $props();

  /**
   * 起始屏：优先认 `?s=`（服务端也算得出来，所以分享出去的链接直接落在那一屏，不用等 JS 跳）。
   * `untrack` 是有意的：路由参数只在进入时用一次，之后翻页由 `index` 自己说了算
   * （`slideIndexOf` 认不出来就退回封面）。
   */
  let index = $state(untrack(() => Math.max(0, slideIndexOf(deck, data.slide))));
  let playing = $state(false);
  /** 自动播放的节奏：牌局章要读字，比概念章慢一点 */
  let manualPause = $state(false);
  let menuOpen = $state(false);
  let reducedMotion = $state(false);
  /** 只在手动翻页时更新，供读屏播报（自动播放会刷屏） */
  let announcement = $state('');

  const total = deck.slides.length;
  const slide = $derived(deck.slides[index] ?? deck.slides[0]!);
  const story = $derived(slide.storySlug === undefined ? null : (STORIES.find((item) => item.slug === slide.storySlug) ?? null));
  const chapter = $derived(deck.chapters.find((item) => item.id === slide.chapterId) ?? null);
  const progress = $derived(total <= 1 ? 100 : Math.round(((index + 1) / total) * 100));
  /** 概念章 7 秒一屏、牌局章 11 秒（要读完那几句话） */
  const delay = $derived(slide.chapterId === 'basics' || slide.kind === 'cover' || slide.kind === 'end' ? 7000 : 11000);

  onMount(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = media.matches;
    const fromHash = window.location.hash.replace(/^#/, '');
    if (fromHash.length > 0 && window.location.search === '') {
      const found = slideIndexOf(deck, fromHash);
      if (found >= 0) index = found;
    }
    // 默认就往下走（这是「视频感」的来源）；系统设了「减少动态效果」就先不动，
    // 由用户按 ▶。任何时候手动翻页都会停下（go() 里 playing = false）。
    if (!media.matches) playing = true;
    const onVisibility = (): void => {
      if (document.hidden) playing = false;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });

  // 自动播放：一条 setTimeout 链，翻页即重建、卸载即清理
  $effect(() => {
    if (!playing) return;
    if (index >= total - 1) {
      playing = false;
      return;
    }
    const timer = setTimeout(() => {
      index += 1;
    }, delay);
    return () => clearTimeout(timer);
  });

  // 深链：翻到哪一屏，地址栏就写哪一屏（replaceState，不往历史里塞 60 条记录）
  $effect(() => {
    const id = slide.id;
    if (typeof window === 'undefined') return;
    if (window.location.hash.replace(/^#/, '') !== id) {
      window.history.replaceState(null, '', `#${id}`);
    }
  });

  function go(next: number, announce = true): void {
    const clamped = Math.max(0, Math.min(total - 1, next));
    if (clamped === index) return;
    index = clamped;
    manualPause = true;
    playing = false;
    if (announce) {
      const target = deck.slides[clamped]!;
      announcement = `第 ${clamped + 1} 屏，共 ${total} 屏：${target.chapterTitle} · ${target.title}`;
    }
  }

  function togglePlay(): void {
    if (index >= total - 1) index = 0;
    playing = !playing;
    manualPause = false;
  }

  function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true) return;
    switch (event.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        event.preventDefault();
        go(index + 1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        go(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        go(0);
        break;
      case 'End':
        event.preventDefault();
        go(total - 1);
        break;
      case 'Escape':
        menuOpen = false;
        break;
      case 'p':
      case 'P':
        event.preventDefault();
        togglePlay();
        break;
      default:
        break;
    }
  }

  const ghost = 'rounded-lg px-3 py-1.5 text-[11px] text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 disabled:opacity-30';
</script>

<svelte:window onkeydown={onKeydown} />

<main class="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-3 py-4 sm:px-6">
  <header class="flex flex-wrap items-center gap-2">
    <a class="text-xs text-white/50 hover:text-white" href="/">← 大厅</a>
    <a class="text-xs text-white/50 hover:text-white" href="/rules">文字教程</a>
    <div class="ml-auto flex flex-wrap items-center gap-1.5">
      <button type="button" class={ghost} onclick={() => (menuOpen = !menuOpen)} aria-expanded={menuOpen}>
        {slide.chapterTitle} ▾
      </button>
      <button
        type="button"
        class={ghost}
        onclick={togglePlay}
        aria-label={playing ? '暂停自动播放' : '开始自动播放'}
      >
        {playing ? '⏸ 暂停' : '▶ 自动播放'}
      </button>
      <span class="text-[11px] tabular-nums text-white/45">{index + 1} / {total}</span>
    </div>
  </header>

  <div class="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
    <div class="h-full bg-gold transition-all" style={`width:${progress}%`}></div>
  </div>

  {#if menuOpen}
    <nav class="mt-3 grid gap-1 rounded-2xl bg-black/40 p-3 ring-1 ring-white/10" aria-label="章节">
      {#each deck.chapters as item (item.id)}
        <button
          type="button"
          class={[
            'flex items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/10',
            item.id === slide.chapterId ? 'bg-white/10' : ''
          ]}
          onclick={() => {
            go(item.first);
            menuOpen = false;
          }}
        >
          <span class="min-w-0 flex-1 truncate text-[12px] text-ivory">{item.title}</span>
          <span class="shrink-0 text-[10px] text-white/40">{item.blurb} · {item.count} 屏</span>
        </button>
      {/each}
    </nav>
  {/if}

  <div class="relative mt-3 min-h-0 flex-1">
    <!-- 两侧点击区：鼠标/触屏都能翻页 -->
    <button
      type="button"
      class="absolute inset-y-0 left-0 z-10 w-[12%] cursor-w-resize opacity-0"
      aria-label="上一屏"
      onclick={() => go(index - 1)}
    ></button>
    <button
      type="button"
      class="absolute inset-y-0 right-0 z-10 w-[12%] cursor-e-resize opacity-0"
      aria-label="下一屏"
      onclick={() => go(index + 1)}
    ></button>

    <div
      class="rounded-2xl bg-black/25 p-4 ring-1 ring-white/10 sm:p-6"
      role="group"
      aria-roledescription="幻灯片"
      aria-label={`第 ${index + 1} 屏，共 ${total} 屏：${slide.title}`}
    >
      <DeckSlide {slide} {story} />
    </div>
  </div>

  <p class="sr-only" aria-live="polite">{announcement}</p>

  <footer class="mt-3 flex flex-wrap items-center justify-between gap-2 pb-2">
    <button type="button" class={ghost} disabled={index === 0} onclick={() => go(index - 1)}>← 上一屏</button>
    <span class="text-[10px] text-white/35">
      ← → / 空格翻页 · P 播放暂停 · 每屏都有地址（{`#${slide.id}`}）
      {#if reducedMotion && !playing}· 已按系统设置不自动播放{/if}
      {#if manualPause && !playing}· 手动翻页后已暂停{/if}
    </span>
    <button type="button" class={ghost} disabled={index >= total - 1} onclick={() => go(index + 1)}>下一屏 →</button>
  </footer>
</main>
