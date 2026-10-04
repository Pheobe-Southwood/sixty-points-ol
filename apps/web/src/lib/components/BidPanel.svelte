<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import { SPECTATOR_LABEL_SEAT } from '$lib/role';
  import { BID_GLYPH, bidCandidates, isRedStrain } from '$lib/labels';
  import AuctionRecord from './AuctionRecord.svelte';

  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  /** 观战者没有座位（-1）：myTurn 恒为 false，于是只看到叫牌板、没有叫品按钮 */
  const mySeat = $derived(client.you?.seat ?? SPECTATOR_LABEL_SEAT);
  const names = $derived((client.table?.seats ?? []).map((seat) => seat.name));
  const myTurn = $derived(deal !== null && deal.phase === 'auction' && deal.auctionTurn === mySeat);
  const rows = $derived(view === null ? [] : bidCandidates(view));
</script>

<!-- 面板自己就是**唯一**的滚动区，「不叫」是它内部的 sticky 页脚。
     上一版反过来做：面板是 flex 列 + overflow-hidden，只靠 max-h 限高。那个形状在手机上
     必然丢掉「不叫」——面板可用高度只有 ~240px（毡面 56%），而它的固定开销（内边距 32 +
     标题 20 + 大字 38 + 候选区 176 + 按钮 46）要 ~344px。唯一可压缩的是历史区，压到 0
     之后差额由 overflow-hidden 从**底部**裁掉，裁掉的正是排在最后的「不叫」；它又不在任何
     滚动区里，滚也滚不回来（60 那一行同样被切掉半截）。
     现在：整块面板滚动（历史与候选行在同一个滚动流里），「不叫」用 sticky bottom-* 贴住
     scrollport 底边 —— 任何视口高度、任何轮数都点得到；sticky 的距离与面板内边距一致，
     所以不滚动时它就在原位，观感与普通底栏一样。
     外层几何（top-[22%] / max-h-[56%]）不动：手机上面板底边已经正好贴着左下「我」座位卡
     的上沿，再抬高就会盖住座位卡。
     判据落在 `src/lib/panel-guard.ts`（`test/bid-panel.test.ts` 与 ui-check 共用同一份）：
     所以这个 section 里**不许**再出现第二处 overflow-* —— 叫牌记录交给 `AuctionRecord` 渲染，
     它本身是普通文档流（内部不再自己滚），跟着面板一起滚。 -->
<section
  data-bid-panel="true"
  class="absolute inset-x-3 top-[22%] max-h-[56%] overflow-y-auto overscroll-contain rounded-2xl bg-black/55 p-4 ring-1 ring-white/10 backdrop-blur-sm sm:inset-x-0 sm:top-1/2 sm:mx-auto sm:max-h-[74%] sm:w-[22rem] sm:-translate-y-1/2 sm:p-5"
>
  {#if view !== null}
    <AuctionRecord {view} {mySeat} {names} />
  {/if}

  {#if myTurn}
    <!-- 候选行同样在面板的滚动流里：抬高叫品时整块往下长，滚过去就能点到 -->
    <div class="mt-3 space-y-1.5">
      {#each rows as row (row.points)}
        <div class="flex items-center gap-1.5">
          <span class="w-7 shrink-0 text-right text-xs tabular-nums text-white/55">{row.points}</span>
          {#each row.strains as strain (strain)}
            <button
              type="button"
              class={['bidbtn rounded-lg bg-white/10 px-2.5 py-1.5 text-[13px] hover:bg-white/20',
                isRedStrain(strain) && 'text-rose-300']}
              disabled={client.busy}
              onclick={() => void client.bid({ points: row.points, strain })}
            >
              {BID_GLYPH[strain]}
            </button>
          {/each}
        </div>
      {/each}
    </div>
    <!-- sticky bottom-4 / sm:bottom-5 对应面板的 p-4 / sm:p-5：贴住底边但不脱出内边距。
         bg-ink/95 是给滚到它下面的内容准备的底：不透明才不会两条字叠在一起。 -->
    <button
      type="button"
      class="sticky bottom-4 mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-white/25 bg-ink/95 px-4 py-2.5 text-sm font-bold text-ivory disabled:opacity-40 sm:bottom-5"
      disabled={client.busy}
      onclick={() => void client.bid('pass')}
    >
      不叫
    </button>
  {/if}
</section>
