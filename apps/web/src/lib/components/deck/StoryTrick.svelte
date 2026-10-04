<script lang="ts">
  import { handFromKeys } from '$lib/story/replay';
  import type { StoryDealData, StoryTrick } from '$lib/story/story-data';
  import CardRow from '$lib/components/CardRow.svelte';
  import TrickDrop from './TrickDrop.svelte';

  let { story, trick }: { story: StoryDealData; trick: StoryTrick } = $props();

  // 都写成 $derived：翻页时组件不重建，只是 story/trick 两个 prop 换掉；
  // 直接 `const trump = story.deal.trump` 只会捕获到第一副牌的将牌。
  const trump = $derived(story.deal.trump);
  const declarerSeat = $derived(story.deal.contract?.declarerSeat ?? null);

  /** 到这一墩为止，庄家与闲家各自抓了多少分（现算，不写死） */
  const before = $derived(
    story.tricks
      .filter((item) => item.ordinal < trick.ordinal)
      .reduce(
        (acc, item) => {
          if (item.winnerSeat === declarerSeat) acc.declarer += item.points;
          else acc.defenders += item.points;
          return acc;
        },
        { declarer: 0, defenders: 0 }
      )
  );
  const after = $derived({
    declarer: before.declarer + (trick.winnerSeat === declarerSeat ? trick.points : 0),
    defenders: before.defenders + (trick.winnerSeat === declarerSeat ? 0 : trick.points)
  });
  const isLast = $derived(trick.ordinal === story.tricks.length - 1);
</script>

<div class="grid gap-3">
  <div class="rounded-xl bg-black/30 p-3">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p class="text-sm font-bold text-ivory">第 {trick.ordinal + 1} 墩 · {story.names[trick.leaderSeat]} 领出</p>
      <!-- {#key} 让徽标每墩重建一次，`.pts-pop` 那段 CSS 动画才会重新跑（纯 CSS，不占 Svelte 过渡的 transform） -->
      {#key trick.ordinal}
        <span class="pts-pop inline-block rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-ink">
          {story.names[trick.winnerSeat]} 赢墩{trick.points > 0 ? ` +${trick.points} 分` : ' · 0 分'}
        </span>
      {/key}
      {#if isLast}
        <span class="rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-gold ring-1 ring-gold/40">最后一轮</span>
      {/if}
    </div>
    <p class="mt-1 text-[11px] text-white/55">
      每家 {trick.size} 张 · 本墩 {trick.points} 分 · 抓分累计：庄家 {after.declarer} / 闲家 {after.defenders}
    </p>
  </div>

  {#each trick.plays as play (play.seat)}
    {@const line = trick.lines.find((item) => item.seat === play.seat)}
    <div class="grid gap-2 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-start">
      <div class="rounded-xl bg-black/25 p-2">
        <TrickDrop
          cards={handFromKeys(play.cards)}
          seat={play.seat}
          {trump}
          caption={story.names[play.seat]}
          badge={trick.winnerSeat === play.seat ? '赢墩' : null}
          popKey={trick.ordinal}
        />
      </div>
      <div class="rounded-xl bg-black/30 p-2.5">
        <p class="text-[11px] text-white/45">
          {story.names[play.seat]} {line?.headline.replace(`${story.names[play.seat]} `, '') ?? ''}
        </p>
        {#if line !== undefined && line.tags.length > 0}
          <p class="mt-1 flex flex-wrap gap-1">
            {#each line.tags as tag (tag)}
              <span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/55">{tag}</span>
            {/each}
          </p>
        {/if}
        {#if line?.text}
          <p class="mt-1.5 text-[12px] leading-relaxed text-white/80">{line.text}</p>
        {/if}
      </div>
    </div>
  {/each}

  {#if trick.note !== null}
    <div class="rounded-xl bg-gold/10 p-2.5 ring-1 ring-gold/25">
      <p class="text-[10px] text-gold/80">这一墩的看点</p>
      <p class="mt-1 text-[12px] leading-relaxed text-white/80">{trick.note}</p>
    </div>
  {/if}

  {#if isLast}
    <div class="rounded-xl bg-black/30 p-2.5">
      <p class="text-[10px] text-white/45">底牌这三张（结算时按末轮张数计入庄家）</p>
      <CardRow cards={handFromKeys(story.deal.kitty)} {trump} size="sm" />
    </div>
  {/if}
</div>
