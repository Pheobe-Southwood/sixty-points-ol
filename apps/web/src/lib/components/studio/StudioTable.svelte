<script lang="ts">
  import { cardKey, cardsPoints, highestBid, levelLabel, sortHand } from '@sixty/engine';
  import CardRow from '$lib/components/CardRow.svelte';
  import HandFan from '$lib/components/HandFan.svelte';
  import LevelBadge from '$lib/components/LevelBadge.svelte';
  import TrickCluster from '$lib/components/TrickCluster.svelte';
  import { callText, strainGlyph, trumpText } from '$lib/labels';
  import type { StudioState } from '$lib/story/studio.svelte.ts';

  let { studio }: { studio: StudioState } = $props();

  const SEATS = [0, 1, 2] as const;
  const panel = 'rounded-2xl bg-black/25 p-3 ring-1 ring-white/10';
  const btn =
    'rounded-lg px-2.5 py-1.5 text-[11px] ring-1 transition hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent';

  let showAll = $state(true);

  const deal = $derived(studio.state?.deal ?? null);
  const phase = $derived(deal?.phase ?? null);
  const trump = $derived(studio.trump);
  const names = $derived(studio.meta.names);
  const hands = $derived(deal?.hands ?? []);
  const captured = $derived(deal?.captured ?? []);
  const contract = $derived(deal?.contract ?? null);
  const summary = $derived(deal?.summary ?? null);
  const currentPlays = $derived(deal?.trick?.plays ?? []);
  const lastTrick = $derived(studio.tricks.length > 0 ? studio.tricks[studio.tricks.length - 1]! : null);
  const plays = $derived(currentPlays.length > 0 ? currentPlays : (lastTrick?.plays ?? []));
  const winnerSeat = $derived(currentPlays.length > 0 ? null : (lastTrick?.winnerSeat ?? null));
  const shownPoints = $derived(currentPlays.length > 0 ? 0 : (lastTrick?.points ?? 0));
  const highest = $derived(deal === null ? null : highestBid(deal));

  const statusText = $derived.by(() => {
    const turn = studio.turn;
    if (deal === null) return '还没有发牌';
    if (phase === 'auction') return `叫牌 · 轮到 ${turn === null ? '—' : names[turn]}`;
    if (phase === 'bury') return `埋底 · ${turn === null ? '—' : names[turn]} 选 3 张扣回去`;
    if (phase === 'play') return `打牌 · 第 ${studio.tricks.length + 1} 墩 · 轮到 ${turn === null ? '—' : names[turn]}`;
    return '本副已结算';
  });

  function seatRole(seat: number): string {
    if (contract === null) return '';
    return contract.declarerSeat === seat ? '庄家' : '闲家';
  }
</script>

<section class="grid gap-3">
  <div class={panel}>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-bold text-ivory">{statusText}</p>
      {#if studio.previewing}
        <span class="flex items-center gap-1.5">
          <span class="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] text-gold">
            正在回看第 {(studio.previewIndex ?? 0) + 1} 步
          </span>
          <button type="button" class={btn} onclick={() => (studio.previewIndex = null)}>回到最新</button>
        </span>
      {/if}
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/55">
      <span>将牌：{trump === null ? '未定（还没叫牌成交）' : trumpText(trump)}</span>
      {#if contract !== null}
        <span>定约：<b class="text-gold">{names[contract.declarerSeat]} {contract.points}{strainGlyph(contract.strain)}</b></span>
      {/if}
      {#if highest !== null}
        <span>当前最高：{callText(highest)}</span>
      {/if}
    </div>

    {#if studio.notice !== null}
      <p class="mt-2 rounded-lg bg-black/40 px-3 py-2 text-[11px] text-amber-200">{studio.notice}</p>
    {/if}

    {#if contract !== null}
      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span class="text-white/45">已抓分</span>
        <span class="text-emerald-300">庄家 {studio.points.declarer}</span>
        <span class="text-rose-300">闲家 {studio.points.defenders}</span>
        <span class="text-gold/80">底牌 {studio.points.kitty} 分</span>
      </div>
    {/if}
  </div>

  {#if deal !== null && phase === 'auction'}
    <div class={panel}>
      <h3 class="text-xs font-bold text-ivory">叫牌</h3>
      {#if studio.previewing}
        <p class="mt-1 text-[11px] text-white/45">正在回看历史：点「回到最新」才能继续出手。</p>
      {:else}
        <div class="mt-2 grid gap-1">
          {#each studio.bidRows as row (row.points)}
            <div class="flex items-center gap-1.5">
              <span class="w-8 text-right text-[11px] tabular-nums text-white/50">{row.points}</span>
              {#each row.strains as strain (strain)}
                <button
                  type="button"
                  class="bidbtn rounded-md bg-white/10 px-2 py-1 text-[13px] hover:bg-white/20"
                  class:text-rose-300={strain === 'H' || strain === 'D'}
                  onclick={() => studio.bid({ points: row.points, strain })}>{strainGlyph(strain)}</button
                >
              {/each}
            </div>
          {/each}
          <button type="button" class={[btn, 'mt-1 w-fit text-white/70 ring-white/20']} onclick={() => studio.bid('pass')}>
            不叫
          </button>
        </div>
      {/if}
    </div>
  {/if}

  {#if deal !== null && (phase === 'bury' || phase === 'play')}
    <div class={panel}>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="text-xs font-bold text-ivory">
          {names[studio.turn ?? 0]} 的手牌
          {#if phase === 'bury'}
            <span class="ml-1 font-normal text-[11px] text-white/45">选 3 张扣入暗底</span>
          {:else}
            <span class="ml-1 font-normal text-[11px] text-white/45">点牌面选牌，可多张</span>
          {/if}
        </h3>
        {#if phase === 'play'}
          <span class="text-[11px]">
            {#if studio.selectedCards.length === 0}
              <span class="text-white/45">还没选牌</span>
            {:else if studio.verdict === null}
              <span class="font-semibold text-emerald-300">✓ 合法（{studio.selectedCards.length} 张）</span>
            {:else}
              <span class="font-semibold text-rose-300">✗ {studio.verdict}</span>
            {/if}
          </span>
        {/if}
      </div>

      <div class="mt-2 rounded-xl bg-black/25 px-2 py-2">
        <HandFan
          hand={sortHand(hands[studio.turn ?? 0] ?? [], trump)}
          {trump}
          selected={studio.selected}
          selectable={!studio.previewing}
          onToggle={(card) => studio.toggle(cardKey(card))}
        />
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-2">
        {#if phase === 'bury'}
          <span class="text-[11px] text-white/45">已选 {studio.selectedCards.length} / 3</span>
          <button
            type="button"
            class={[btn, 'bg-gold/90 font-bold text-ink ring-transparent hover:bg-gold']}
            disabled={studio.previewing || studio.selectedCards.length !== 3}
            onclick={() => studio.bury()}>埋底</button
          >
        {:else}
          <button
            type="button"
            class={[btn, 'bg-gold/90 font-bold text-ink ring-transparent hover:bg-gold']}
            disabled={studio.previewing || studio.selectedCards.length === 0 || studio.verdict !== null}
            onclick={() => studio.play()}>出牌</button
          >
        {/if}
        <button
          type="button"
          class={[btn, 'text-white/60 ring-white/15']}
          disabled={studio.selectedCards.length === 0}
          onclick={() => studio.clearSelection()}>清空选择</button
        >
      </div>
    </div>
  {/if}

  {#if deal !== null}
    <div class={panel}>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-xs font-bold text-ivory">本轮出牌</h3>
        {#if winnerSeat !== null}
          <span class="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-ink">
            {names[winnerSeat]} 赢墩{shownPoints > 0 ? ` +${shownPoints} 分` : ''}
          </span>
        {/if}
      </div>
      {#if plays.length === 0}
        <p class="mt-2 text-[11px] text-white/45">本轮还没有人出牌。</p>
      {:else}
        <div class="mt-2 flex flex-wrap items-end gap-4">
          {#each plays as play (play.seat)}
            <TrickCluster
              cards={play.cards}
              {trump}
              caption={names[play.seat]}
              badge={winnerSeat === play.seat ? '赢墩' : null}
            />
          {/each}
        </div>
      {/if}
    </div>

    <div class={panel}>
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold text-ivory">三家手牌（只有作者看得到）</h3>
        <button type="button" class={btn} onclick={() => (showAll = !showAll)}>
          {showAll ? '只看当前一家' : '摊开三家'}
        </button>
      </div>
      <div class="mt-2 grid gap-2">
        {#each SEATS as seat (seat)}
          {#if showAll || seat === studio.turn}
            <div class="rounded-xl bg-black/25 p-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="w-4"><LevelBadge level={studio.spec.levels[seat] ?? { rank: 2, cycle: 0 }} /></span>
                <span class="text-[11px] font-semibold text-ivory">{names[seat]}</span>
                {#if seatRole(seat) !== ''}
                  <span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/55">{seatRole(seat)}</span>
                {/if}
                {#if studio.turn === seat}
                  <span class="rounded-full bg-gold/25 px-1.5 py-0.5 text-[10px] text-gold">轮到</span>
                {/if}
                <span class="ml-auto text-[10px] text-white/40">
                  {hands[seat]?.length ?? 0} 张 · 已抓 {captured[seat] === undefined ? 0 : cardsPoints(captured[seat])} 分
                </span>
              </div>
              <div class="mt-1.5">
                {#if seat === studio.turn && (phase === 'bury' || phase === 'play')}
                  <p class="text-[10px] text-white/35">该家的牌在上面「手牌」区里选</p>
                {:else}
                  <CardRow cards={sortHand(hands[seat] ?? [], trump)} {trump} size="sm" />
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>

    <div class={panel}>
      <h3 class="text-xs font-bold text-ivory">暗底</h3>
      <div class="mt-2 grid gap-2">
        <div>
          <p class="text-[10px] text-white/45">发牌时留下的 3 张</p>
          <CardRow cards={deal.originalKitty} {trump} size="sm" />
        </div>
        {#if contract !== null}
          <div>
            <p class="text-[10px] text-white/45">庄家埋入的 3 张（结算前对闲家不可见）</p>
            <CardRow cards={deal.kitty} {trump} size="sm" />
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if summary !== null}
    <div class={panel}>
      <h3 class="text-xs font-bold text-ivory">结算</h3>
      <div class="mt-2 grid gap-1 text-[11px] text-white/70">
        <p>庄家墩分 <b class="text-ivory">{summary.declarerTrickPoints}</b>，闲家 <b class="text-ivory">{summary.defenderTrickPoints}</b></p>
        <p>
          底牌 {summary.kittyPoints} 分 × 末轮 {summary.multiplier} 张 =
          <b class="text-gold">{summary.protectedBottom ? '+' : '−'}{summary.kittyPoints * summary.multiplier}</b>
          （{summary.protectedBottom ? '保底' : '抠底'}）
        </p>
        <p>最终得分 <b class="text-gold">{summary.finalScore}</b> vs 定约 {summary.contract.points} → {summary.made ? '打成' : '打输'}</p>
        {#if summary.made}
          <p>庄家升级 {summary.levelChanges[0]?.levels ?? 0} 级</p>
        {:else}
          <p>差 {summary.shortfall} 分，两家闲家各升 {summary.levelChanges[0]?.levels ?? 0} 级</p>
        {/if}
        <ul class="mt-1 space-y-0.5">
          {#each summary.levelChanges as change (change.seat)}
            <li class="text-white/55">
              {names[change.seat]}：{levelLabel(change.from)} → <b class="text-ivory">{levelLabel(change.to)}</b>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
</section>
