<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';
  import { SPECTATOR_LABEL_SEAT } from '$lib/role';
  import { BID_GLYPH, bidCandidates, isRedStrain } from '$lib/labels';
  import AuctionHistory from './AuctionHistory.svelte';
  import AuctionInfo from './AuctionInfo.svelte';

  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  /** 观战者没有座位（-1）：myTurn 恒为 false，于是只看到叫牌板、没有叫品按钮 */
  const mySeat = $derived(client.you?.seat ?? SPECTATOR_LABEL_SEAT);
  const names = $derived((client.table?.seats ?? []).map((seat) => seat.name));
  const myTurn = $derived(deal !== null && deal.phase === 'auction' && deal.auctionTurn === mySeat);
  /**
   * 候选档位只给**三档**（基准 = 当前最高分，再 +5、+10）：正常情况不跳叫（见 /rules），
   * 再往后排只是把面板撑高。更大的跳叫仍可由 API / MCP 叫出 —— 引擎的合法集没变，
   * 这里少的只是「界面上一次摆几档」。`bidCandidates` 的第二参是 spread，档位数 = spread + 1。
   */
  const rows = $derived(view === null ? [] : bidCandidates(view, 2));
</script>

<!-- 面板是一个 flex 列，里面**只有叫牌历史那一块**会滚（min-h-0 + flex-1 = 先被压缩、
     自己滚），「不叫」排在它后面、走正常文档流。于是页脚既不压住内容，也不会被裁掉。
     两代坏形状都被 `panel-guard.ts` 钉住了：
     1. 早先面板是 flex 列 + overflow-hidden，「不叫」排在最后 —— 内容超过 max-h 时它被
        从底部裁掉，且不在任何滚动区里，滚也滚不回来。
     2. 上一版改成「面板自己滚 + 不叫 sticky 贴底」：按钮点得到，但它是**浮**在内容上的，
        滚动时压住排在最后的历史行（手机上那半行叫牌记录就是这么被切掉的）——sticky 页脚
        的语义就是遮挡，换个顺序只是换谁被挡，所以这一版把它整个去掉。
     面板自己仍留 overflow-y-auto 兜底：万一固定块（信息面 + 三档档位 + 页脚）本身就超过
     max-h（很矮的视口），整个面板可滚，按钮滚一下就到 —— 这是可滚，不是被裁。
     判据落在 `src/lib/panel-guard.ts`（`test/bid-panel.test.ts` 与 ui-check 共用同一份）。
     外层几何（top-[22%] / max-h-[56%]）不动：手机上面板底边已经正好贴着左下「我」座位卡
     的上沿，再抬高就会盖住座位卡。 -->
<section
  data-bid-panel="true"
  class="absolute inset-x-3 top-[22%] flex max-h-[56%] flex-col overflow-y-auto overscroll-contain rounded-2xl bg-black/55 p-4 ring-1 ring-white/10 backdrop-blur-sm sm:inset-x-0 sm:top-1/2 sm:mx-auto sm:max-h-[74%] sm:w-[22rem] sm:-translate-y-1/2 sm:p-5"
>
  {#if view !== null}
    <div class="shrink-0">
      <AuctionInfo {view} {mySeat} {names} />
    </div>

    {#if myTurn}
      <!-- 候选行固定高度（shrink-0）：抬高叫品时整块往下长，被压缩的是历史区 -->
      <div class="mt-3 shrink-0 space-y-1.5">
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
    {/if}

    <!-- 面板里唯一自己滚的一块：高度由上面的固定块决定，历史多了就在这里滚，
         绝不会淌到页脚底下（页脚不在这个滚动区里）。 -->
    <div data-bid-history="true" class="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <AuctionHistory {view} {mySeat} {names} />
    </div>
  {/if}

  {#if myTurn}
    <button
      type="button"
      class="mt-3 flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/5 px-4 py-2.5 text-sm font-bold text-ivory transition hover:bg-white/10 disabled:opacity-40"
      disabled={client.busy}
      onclick={() => void client.bid('pass')}
    >
      不叫
    </button>
  {/if}
</section>
