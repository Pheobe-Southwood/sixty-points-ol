<script lang="ts">
  import type { Seat } from '@sixty/engine';
  import CardRow from '$lib/components/CardRow.svelte';
  import LevelBadge from '$lib/components/LevelBadge.svelte';
  import { bidText, strainGlyph, trumpText } from '$lib/labels';
  import { handFromKeys } from '$lib/story/replay';
  import { SOURCE_LABEL, type StoryDealData, type StoryLine } from '$lib/story/story-data';
  import type { Slide } from '$lib/tutorial/deck';
  import { dealtHands, handsAfterTrick, playHands, type SeatHands } from '$lib/tutorial/position';
  import { fly } from 'svelte/transition';
  import DeckWidget from './DeckWidget.svelte';
  import SeatHandsPanel from './SeatHands.svelte';
  import StoryTrick from './StoryTrick.svelte';
  import { motionMs } from './motion';

  let { slide, story }: { slide: Slide; story: StoryDealData | null } = $props();

  /** 正文里用 **粗体** 标出关键结论；这里只做最小解析，不引 markdown 依赖 */
  function segments(text: string): string[] {
    return text.split('**');
  }

  const summary = $derived(story?.deal.summary ?? null);
  const trump = $derived(story?.deal.trump ?? null);
  const lines = $derived(
    story === null ? [] : (slide.lineIndexes ?? []).map((index) => story.lines[index]).filter((line): line is StoryLine => line !== undefined)
  );

  /**
   * 三家当前的牌。这块面板**只在这里渲染一份**、位置固定在标题下方，
   * 所以翻页时它不重建、只是里面的牌增删 —— 「打出去的牌从手里飞走」才成立
   * （同一个 `{#each}` 里少了的那张牌，正好和出牌区新增的那张配对）。
   */
  const hands = $derived(handsForSlide());
  const handsCaption = $derived(handsCaptionForSlide());
  const activeSeat = $derived(activeSeatForSlide());

  function handsForSlide(): SeatHands | null {
    if (story === null) return null;
    switch (slide.kind) {
      case 'story-intro':
      case 'story-deal':
      case 'story-bid':
        return dealtHands(story);
      case 'story-bury':
        return playHands(story);
      case 'story-trick':
        return handsAfterTrick(story, slide.trickOrdinal ?? 0);
      default:
        return null;
    }
  }

  function handsCaptionForSlide(): string | null {
    if (story === null) return null;
    switch (slide.kind) {
      case 'story-intro':
      case 'story-deal':
        return '发牌：三家各 17 张（另有 3 张扣着的暗底）';
      case 'story-bid':
        return '叫牌阶段：三家各 17 张，一张牌都还没出';
      case 'story-bury':
        return '埋底之后：庄家换掉 3 张，三家各 17 张';
      case 'story-trick': {
        const last = (slide.trickOrdinal ?? 0) === story.tricks.length - 1;
        return last ? '最后一墩打完，这副牌的牌就出完了' : '打完这一墩，三家剩下这些';
      }
      default:
        return null;
    }
  }

  /** 金环标出「这一屏正在动的人」：叫牌是最后开口的那家，出牌是这一墩的赢家 */
  function activeSeatForSlide(): Seat | null {
    if (story === null) return null;
    if (slide.kind === 'story-bid') return lines.at(-1)?.seat ?? null;
    if (slide.kind === 'story-trick') return story.tricks[slide.trickOrdinal ?? 0]?.winnerSeat ?? null;
    return null;
  }
</script>

<article class="grid gap-4">
  <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <span class="rounded-full bg-gold/15 px-2.5 py-0.5 text-[10px] font-semibold text-gold ring-1 ring-gold/30">
      {slide.chapterTitle}
    </span>
    {#if story !== null && slide.kind.startsWith('story-')}
      <span class="text-[11px] text-white/45">
        {story.spec.seed} · {trump === null ? '' : trumpText(trump)} · 级牌按庄家 {story.names[story.deal.contract?.declarerSeat ?? 0]} 的级别
      </span>
    {/if}
  </header>

  <h2 class="text-xl font-black tracking-wide text-ivory sm:text-2xl">{slide.title}</h2>

  {#if hands !== null && story !== null}
    <SeatHandsPanel {story} {hands} caption={handsCaption} {activeSeat} />
  {/if}

  {#if slide.kind === 'cover'}
    <div class="grid gap-3">
      <p class="text-sm leading-relaxed text-white/70">
        六十分是<b class="text-ivory">桥牌</b>、<b class="text-ivory">双升</b>与<b class="text-ivory">斗地主</b>的融合版：一副 54 张、三家、
        桥牌式叫牌定庄定将、双升式打牌与升级。
      </p>
      <p class="text-sm leading-relaxed text-white/70">
        这一份演示分两半：前半是把规则拆成十几屏讲清楚，后半是三副真实牌局——
        <b class="text-ivory">每一步都有讲解</b>，讲解来自牌手本人。
      </p>
      <p class="text-[11px] text-white/45">
        用 ← →（或点屏幕两侧）翻页；空格/自动播放会自动往下走；每屏都能深链，例如 <code class="font-mono">#245-trick-8</code>。
      </p>
    </div>

  {:else if slide.kind === 'concept'}
    <!-- 两列只在真的有挂件时启用：没有挂件的屏（如「叫高没有好处」）在 lg 下
         若仍占左栏 46%，正文会被挤成窄条，右半边空着一大片。 -->
    <div
      class={[
        'grid gap-3',
        slide.widget === undefined ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]'
      ]}
    >
      <div class="space-y-2">
        {#each slide.points as point, index (index)}
          <p class="text-[13px] leading-relaxed text-white/70">
            {#each segments(point) as segment, part (part)}
              {#if part % 2 === 1}<b class="text-ivory">{segment}</b>{:else}{segment}{/if}
            {/each}
          </p>
        {/each}
      </div>
      {#if slide.widget !== undefined}
        <DeckWidget widget={slide.widget} />
      {/if}
    </div>

  {:else if slide.kind === 'story-intro' && story !== null}
    <div class="grid gap-3">
      {#each slide.points as point, index (index)}
        <p class="whitespace-pre-line text-[13px] leading-relaxed text-white/75">{point}</p>
      {/each}
      <div class="grid gap-2 rounded-xl bg-black/30 p-3 sm:grid-cols-3">
        {#each story.names as name, seat (seat)}
          <div class="flex items-center gap-2">
            <LevelBadge level={story.spec.levels[seat] ?? { rank: 2, cycle: 0 }} />
            <div>
              <p class="text-[12px] font-semibold text-ivory">{name}</p>
              <p class="text-[10px] text-white/45">
                {seat === story.spec.dealerSeat ? '发牌人' : ''}
                {seat === story.deal.contract?.declarerSeat ? '庄家' : '闲家'}
              </p>
            </div>
          </div>
        {/each}
      </div>
    </div>

  {:else if slide.kind === 'story-deal' && story !== null}
    <div class="grid gap-3">
      {#each lines as line (line.index)}
        {#if line.text}<p class="text-[13px] leading-relaxed text-white/75">{line.text}</p>{/if}
      {/each}
      <!-- 三家的手牌在标题下面那条横条里（与叫牌屏、出牌屏同一份 DOM），这里只留暗底 -->
      <div class="rounded-xl bg-black/30 p-3">
        <p class="mb-1 text-[11px] text-white/45">
          暗底 3 张（发牌后扣着，谁都看不到）· 发牌人是 {story.names[story.spec.dealerSeat]}
        </p>
        <CardRow cards={handFromKeys(story.deal.originalKitty)} {trump} size="sm" />
      </div>
    </div>

  {:else if slide.kind === 'story-bid' && story !== null}
    <div class="grid gap-2">
      {#each lines as line (line.index)}
        <!-- 每一手叫品各自从下方轻轻飞入：一屏四手时能看出是一手一手加上去的 -->
        <div class="rounded-xl bg-black/30 p-2.5" in:fly={{ y: 8, duration: motionMs(200) }}>
          <p class="text-[12px] font-semibold text-ivory">{line.headline}</p>
          {#if line.tags.length > 0}
            <p class="mt-1 flex flex-wrap gap-1">
              {#each line.tags as tag (tag)}<span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/55">{tag}</span>{/each}
            </p>
          {/if}
          {#if line.text}
            <p class="mt-1 text-[12px] leading-relaxed text-white/75">{line.text}</p>
          {/if}
        </div>
      {/each}
    </div>

  {:else if slide.kind === 'story-bury' && story !== null}
    <div class="grid gap-3">
      {#each lines as line (line.index)}
        {#if line.text}<p class="text-[13px] leading-relaxed text-white/75">{line.text}</p>{/if}
      {/each}
      <div class="grid gap-2 rounded-xl bg-black/30 p-3 sm:grid-cols-2">
        <div>
          <p class="mb-1 text-[11px] text-white/45">拿上来的底牌 3 张（并进庄家手里，17 → 20）</p>
          <CardRow cards={handFromKeys(story.deal.originalKitty)} {trump} size="sm" />
        </div>
        <div>
          <p class="mb-1 text-[11px] text-white/45">埋回去的 3 张（闲家到结算才看得到）</p>
          <CardRow cards={handFromKeys(story.deal.kitty)} {trump} size="sm" />
        </div>
      </div>
      {#if summary !== null}
        <p class="text-[11px] text-white/55">底牌分：<b class="text-gold">{summary.kittyPoints}</b> 分</p>
      {/if}
    </div>

  {:else if slide.kind === 'story-trick' && story !== null}
    {@const trick = story.tricks[slide.trickOrdinal ?? 0]}
    {#if trick !== undefined}
      <StoryTrick {story} {trick} />
    {/if}

  {:else if slide.kind === 'story-settle' && story !== null && summary !== null}
    <div class="grid gap-3">
      <div class="rounded-xl bg-black/30 p-3">
        <p class="text-[13px] text-white/75">
          墩分 <b class="text-ivory">{summary.declarerTrickPoints}</b>
          <span class="text-white/40">（闲家 {summary.defenderTrickPoints}）</span>
          <span class="text-white/40"> ± </span>
          底牌 <b class="text-ivory">{summary.kittyPoints}</b> 分 × 末轮 <b class="text-ivory">{summary.multiplier}</b> 张
          =
          <b class="text-gold">{summary.finalScore}</b> 分
        </p>
        <p class="mt-1 text-[12px] text-white/65">
          {summary.protectedBottom ? '保底' : '抠底'}：
          {summary.declarerTrickPoints} {summary.protectedBottom ? '+' : '−'} {summary.kittyPoints * summary.multiplier}
          = {summary.finalScore} 分 对定约 {summary.contract.points} 分 → <b class={summary.made ? 'text-emerald-300' : 'text-rose-300'}>{summary.made ? '打成' : '打输'}</b>
        </p>
      </div>
      <div class="grid gap-1.5 rounded-xl bg-black/30 p-3">
        <p class="text-[11px] text-white/45">
          {summary.made ? '打成：庄家升级' : `打输：差 ${summary.shortfall} 分，两家闲家各升 ${summary.levelChanges[0]?.levels ?? 0} 级`}
        </p>
        {#each summary.levelChanges as change (change.seat)}
          <p class="flex items-center gap-2 text-[12px] text-white/70">
            <LevelBadge level={change.from} />
            <span>{story.names[change.seat]}</span>
            <span class="text-white/40">→</span>
            <LevelBadge level={change.to} />
            <span class="text-gold">升 {change.levels} 级</span>
          </p>
        {/each}
      </div>
    </div>

  {:else if slide.kind === 'story-outro' && story !== null}
    <div class="grid gap-3">
      {#each slide.points as point, index (index)}
        <p class="whitespace-pre-line text-[13px] leading-relaxed text-white/75">{point}</p>
      {/each}
      <details class="rounded-xl bg-black/25 p-3 text-[11px] text-white/60">
        <summary class="cursor-pointer text-white/70">
          本副讲解的来源：原话 {story.counts.author} 条 · {SOURCE_LABEL.polish} {story.counts.polish} 条 · {SOURCE_LABEL.fill} {story.counts.fill} 条
          {#if story.counts.blank > 0}· 留空 {story.counts.blank} 条{/if}
        </summary>
        <p class="mt-2 leading-relaxed">
          「原话」是牌手本人写的；「{SOURCE_LABEL.polish}」只动了字句或按引擎事实改写；「{SOURCE_LABEL.fill}」是原本没写、由我补上的。
          逐条对照（原文 → 现在 → 为什么）在仓库的 <code class="font-mono">docs/deals/{story.slug}.review.md</code>。
        </p>
        {#if story.counts.polish > 0}
          <ul class="mt-2 space-y-1">
            {#each story.lines.filter((line) => line.source === 'polish') as line (line.index)}
              <li>
                第 {line.index + 1} 步：原话「{line.original}」→「{line.text}」
              </li>
            {/each}
          </ul>
        {/if}
      </details>
    </div>

  {:else if slide.kind === 'end'}
    <div class="grid gap-3">
      <p class="text-[13px] leading-relaxed text-white/75">
        三副牌局的共同点：<b class="text-ivory">叫分只是及格线，不是收益</b>——
        245 与 222 都是把对手（或自己）推到高分之后打输，级数一分没多拿；zhs7sx 则反过来，
        50 分稳稳打成，靠的是叫牌时就看清的那手清主顺子。
      </p>
      <p class="text-[13px] leading-relaxed text-white/75">
        想逐段查证规则，看文字教程；想自己开一桌，回大厅。
      </p>
      <div class="flex flex-wrap gap-2">
        <a class="rounded-lg bg-gold px-4 py-2 text-xs font-bold text-ink transition hover:brightness-110" href="/rules">完整文字教程 →</a>
        <a class="rounded-lg px-4 py-2 text-xs text-white/80 ring-1 ring-white/20 transition hover:bg-white/10" href="/">回大厅</a>
      </div>
    </div>
  {/if}

  {#if story !== null && slide.kind === 'story-bid' && story.deal.contract !== null && slide.id.endsWith('bid-' + Math.ceil(story.lines.filter((l) => l.kind === 'bid').length / 4))}
    <p class="text-[11px] text-gold/80" in:fly={{ y: 6, duration: motionMs(220) }}>
      成交：{story.names[story.deal.contract.declarerSeat]} {story.deal.contract.points}{strainGlyph(story.deal.contract.strain)} 坐庄
    </p>
  {/if}
</article>
