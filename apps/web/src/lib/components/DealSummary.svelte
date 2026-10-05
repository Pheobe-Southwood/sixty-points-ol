<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import { SPECTATOR_LABEL_SEAT } from '$lib/role';
  import CardView from './Card.svelte';
  import LevelBadge from './LevelBadge.svelte';
  import { kittySign, levelRows, scoreLineText, whoLabel } from '$lib/labels';
  import { strainGlyph } from '$lib/labels';

  let {
    client,
    open = false,
    onClose
  }: { client: TableClient; open?: boolean; onClose?: () => void } = $props();

  const view = $derived(client.view);
  const summary = $derived(view?.deal?.summary ?? null);
  const finished = $derived(view?.status === 'finished');
  const spectating = $derived(client.you === null);
  const mySeat = $derived(client.you?.seat ?? SPECTATOR_LABEL_SEAT);
  const names = $derived((client.table?.seats ?? []).map((seat) => seat.name));
  const who = (seat: number): string => whoLabel(names, mySeat, seat);

  /** 升级表：三家都要出现（没动的那家写「不变」），升级的排前面 —— 见 labels.ts 的 levelRows */
  const rows = $derived(summary !== null && view !== null ? levelRows(summary, view.levels) : []);

  /**
   * 表的列模版：**表头与数据行必须同一份**，否则「谁 / 原级别 / 新级别」三列会各算各的宽度。
   * 第一列 `minmax(0,1fr)` 才能让超长昵称 `truncate`；后三列写死，跨行的列宽因此对齐。
   */
  const COLS = 'grid grid-cols-[minmax(0,1fr)_3rem_1rem_3rem] items-center gap-x-2';
</script>

{#if open && summary !== null && view !== null}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <!-- 高度上限与自己的滚动区：结算内容高度不定（底牌牌面、级别表、对局结束块），
         没有上限时短屏上排在最后的「下一副 / 开新对局」会落到视口外，且无处可滚。 -->
    <div
      class="max-h-[92dvh] w-[24rem] max-w-[94vw] overflow-y-auto overscroll-contain rounded-2xl bg-felt-800 p-4 ring-1 ring-gold/30 sm:p-5"
    >
      <div class="flex items-start justify-between gap-2">
        <h2 class="text-base font-bold">
          本副结算
          <span class="ml-1 text-xs font-normal text-white/50">
            {summary.contract.points}{strainGlyph(summary.contract.strain)} · 庄家
            {who(summary.contract.declarerSeat)}
          </span>
        </h2>
        <button
          type="button"
          class="rounded-md px-2 text-lg leading-none text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="关闭"
          onclick={() => onClose?.()}>×</button
        >
      </div>

      <!-- 一条算式，各项下方标注含义 -->
      <div class="mt-5 flex items-start justify-center gap-1.5">
        <div class="w-14 text-center">
          <p class="text-[26px] font-black leading-none tabular-nums">{summary.declarerTrickPoints}</p>
          <p class="mt-1.5 text-[10px] text-white/50">墩分</p>
        </div>
        <!-- 墩分与底牌之间的符号：抠底是减（保底才是加）。它与数字同级字号字重，
             并按保底/抠底着色 —— 整条式子里只有它决定「加还是扣」，所以要着重强调。
             （早先这里硬写 `+`，抠底时显示出「60 + 10 × 1 = 50」这种自相矛盾的算式。） -->
        <span
          class="text-[26px] font-black leading-none {summary.protectedBottom
            ? 'text-emerald-300'
            : 'text-rose-300'}">{kittySign(summary.protectedBottom)}</span
        >
        <div class="w-14 text-center">
          <p class="text-[26px] font-black leading-none tabular-nums">{summary.kittyPoints}</p>
          <p class="mt-1.5 text-[10px] text-white/50">底牌 {summary.kitty.length} 张</p>
          <div class="kitty-mini mt-1 flex justify-center">
            {#each summary.kitty as card, index (index)}
              <CardView {card} trump={summary.trump} size="sm" />
            {/each}
          </div>
        </div>
        <span class="mt-2 text-lg leading-none text-white/40">×</span>
        <div class="w-10 text-center">
          <p class="text-[26px] font-black leading-none tabular-nums text-gold">{summary.multiplier}</p>
          <p class="mt-1.5 text-[10px] text-white/50">末轮张数</p>
        </div>
        <span class="mt-2 text-lg leading-none text-white/40">=</span>
        <div class="w-14 text-center">
          <p class="text-[26px] font-black leading-none tabular-nums text-gold">{summary.finalScore}</p>
          <p class="mt-1.5 text-[10px] text-white/50">最终得分</p>
        </div>
      </div>

      <!-- 结论只有一行：打输 `50/55（差 5 分）· 闲家升 1 级`，打成 `打成 65/60 · 庄家升 2 级`。
           底色与文字色是现在唯一的输赢着色来源。早先这里是「打输 · 差 N 分」加上一行
           「两名闲家各升 ceil(差 / 10) = N 级；庄家级别不变」—— 三句话说的是一件事。 -->
      <div
        class="mt-4 rounded-xl px-4 py-2 text-center ring-1 {summary.made
          ? 'bg-emerald-500/15 ring-emerald-400/30'
          : 'bg-rose-500/15 ring-rose-400/30'}"
      >
        <p class="text-sm font-bold {summary.made ? 'text-emerald-300' : 'text-rose-300'}">
          {scoreLineText(summary)}
        </p>
      </div>

      <!-- 升级表：谁 / 原级别 / 新级别。三家都列 —— 没升级的那家在「新级别」格写「不变」，
           于是不必再单写一行「庄家级别不变。」。级别复用座位卡那枚 LevelBadge（档位数字 +
           金色「+过次」徽标），所以跨 A 的轮次在这里也读得出来，不是一串 `2(+0) → 3(+0)` 文本。 -->
      <div class="mt-3 space-y-1 text-xs">
        <div class="{COLS} px-3 text-[10px] text-white/45">
          <span>谁</span>
          <span class="text-center">原级别</span>
          <span></span>
          <span class="text-center">新级别</span>
        </div>
        {#each rows as row (row.seat)}
          <div
            class="{COLS} rounded-lg px-3 py-1.5 ring-1 {row.changed
              ? 'bg-gold/15 ring-gold/30'
              : 'bg-white/5 text-white/45 ring-white/10'}"
          >
            <span class="truncate">{who(row.seat)}</span>
            <LevelBadge level={row.from} class={row.changed ? '' : 'opacity-50'} />
            <span class="text-center text-white/40">{row.changed ? '→' : '·'}</span>
            {#if row.changed}
              <LevelBadge level={row.to} />
            {:else}
              <span class="text-center">不变</span>
            {/if}
          </div>
        {/each}
      </div>

      {#if finished && view.result}
        <div class="mt-3 rounded-lg border border-gold/50 bg-black/30 p-3">
          <h3 class="mb-1 text-sm font-semibold text-gold">
            对局结束 · 冠军 {who(view.result.ranking[0]!)}
          </h3>
          <ol class="space-y-0.5 text-xs text-white/80">
            {#each view.result.ranking as seat, index (seat)}
              <li>第 {index + 1} 名：{who(seat)}（总进度 {view.result.progress[seat]}）</li>
            {/each}
          </ol>
        </div>
      {/if}

      <div class="mt-4 flex items-center justify-end gap-2">
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg border border-white/20 px-4 py-1.5 text-xs text-white/70 hover:bg-white/10"
            onclick={() => onClose?.()}
          >
            看看桌面
          </button>
          {#if spectating}
            <span class="self-center text-xs text-white/45">观战中 · 下一副由在座玩家开</span>
          {:else if finished}
            <button
              type="button"
              class="rounded-lg bg-gold px-5 py-1.5 text-xs font-bold text-ink hover:brightness-110 disabled:opacity-40"
              disabled={client.busy}
              onclick={() => void client.newGame()}
            >
              开新对局
            </button>
          {:else}
            <button
              type="button"
              class="rounded-lg bg-gold px-5 py-1.5 text-xs font-bold text-ink hover:brightness-110 disabled:opacity-40"
              disabled={client.busy}
              onclick={() => void client.deal()}
            >
              下一副
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
