<script lang="ts">
  import { levelLabel } from '@sixty/engine';
  import type { TableClient } from '$lib/client/table.svelte';
  import { SPECTATOR_LABEL_SEAT } from '$lib/role';
  import CardView from './Card.svelte';
  import { whoLabel } from '$lib/labels';
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
</script>

{#if open && summary !== null && view !== null}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <div class="w-[24rem] max-w-[94vw] rounded-2xl bg-felt-800 p-4 ring-1 ring-gold/30 sm:p-5">
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
        <span class="mt-2 text-lg leading-none text-white/40">+</span>
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

      <p class="mt-2 text-center text-[10px] {summary.protectedBottom ? 'text-emerald-300/90' : 'text-rose-300/90'}">
        {summary.protectedBottom
          ? `保底 · 末轮由庄家赢下，底分 ×${summary.multiplier} 计入`
          : `抠底 · 末轮被闲家赢走，底分 ×${summary.multiplier} 扣除`}
      </p>

      <div
        class="mt-4 rounded-xl px-4 py-2 text-center ring-1 {summary.made
          ? 'bg-emerald-500/15 ring-emerald-400/30'
          : 'bg-rose-500/15 ring-rose-400/30'}"
      >
        <p class="text-sm font-bold {summary.made ? 'text-emerald-300' : 'text-rose-300'}">
          {summary.made
            ? `打成 · ${summary.finalScore} ≥ ${summary.contract.points}`
            : `打输 · 差 ${summary.shortfall} 分`}
        </p>
        <!-- 把升级依据写出来：升级只看实际得分档位，不看叫了多少分 -->
        <p class="mt-0.5 text-[10px] text-white/55">
          {summary.made
            ? `按 ${summary.finalScore} 分档位：庄家升 ${summary.levelChanges[0]?.levels ?? 0} 级（升几级只看得分，与叫分无关）`
            : `两名闲家各升 ceil(${summary.shortfall} / 10) = ${summary.levelChanges[0]?.levels ?? 0} 级；庄家级别不变`}
        </p>
      </div>

      <div class="mt-3 space-y-1 text-xs">
        {#each summary.levelChanges as change (change.seat)}
          <p class="rounded-lg bg-gold/15 px-3 py-2 ring-1 ring-gold/30">
            {who(change.seat)} 升 {change.levels} 级：<b>{levelLabel(change.from)} → {levelLabel(change.to)}</b>
          </p>
        {/each}
        {#if !summary.made}
          <p class="rounded-lg bg-white/5 px-3 py-2 text-white/60">庄家级别不变。</p>
        {/if}
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
