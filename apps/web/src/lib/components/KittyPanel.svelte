<script lang="ts">
  import { cardKey, cardsPoints } from '@sixty/engine';
  import type { TableClient } from '$lib/client/table.svelte';
  import CardView from './Card.svelte';

  /**
   * 「底牌」页 = 庄家回看**自己埋下去的那 3 张**（CONTEXT.md 的 **埋下的底牌**）。
   *
   * 这不是「拿上来的底牌」：拿上来的那 3 张只活在毡面的埋底面板里（那里可以点它选中），
   * 两处内容互补、不重复。数据来自 `you.buriedKitty` —— 服务端权威，刷新、离座、
   * 补位接手都不丢（客户端自己记一手会在刷新后变空）。
   *
   * 埋底进行中还没有这个字段（那时庄家正拿着 20 张选），改显示他自己当前的选择。
   * 闲家与观战者到结算才随 `summary.kitty` 看到这 3 张。
   */
  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const summary = $derived(deal?.summary ?? null);
  const trump = $derived(deal?.trump ?? null);
  const isDeclarer = $derived(client.you?.isDeclarer === true);
  const buried = $derived(client.you?.buriedKitty ?? null);
  /** 埋底进行中：庄家尚未提交的选择（客户端待提交的那一份，只读展示） */
  const pending = $derived(deal?.phase === 'bury' && isDeclarer ? client.selectedCards : []);
</script>

{#if deal === null}
  <p class="text-xs leading-relaxed text-white/50">
    还没发牌。发牌会留下 3 张暗底：庄家拿底后再埋 3 张回去，那 3 张在结算时按「底分 × 末轮张数」结算。
  </p>
{:else if deal.phase === 'auction'}
  <p class="text-xs leading-relaxed text-white/50">还没成交：叫牌定出庄家之后才有底牌。</p>
{:else if isDeclarer && deal.phase === 'bury'}
  <p class="text-xs text-white/60">
    你正在埋底：已选 <b class="tabular-nums text-gold">{pending.length}</b> / 3 张（点手牌选择）。
  </p>
  <div class="mt-3 flex justify-center gap-2">
    {#each [0, 1, 2] as index (index)}
      <div class="slot" class:filled={pending[index] !== undefined}>
        {#if pending[index]}
          <CardView card={pending[index]!} {trump} size="sm" />
        {:else}
          ✦
        {/if}
      </div>
    {/each}
  </div>
{:else if isDeclarer && buried !== null}
  <p class="text-xs text-white/60">你埋下去的 3 张（结算前只有你看得到）</p>
  <div class="mt-2 flex justify-center gap-2">
    {#each buried as card, index (cardKey(card) + index)}
      <CardView {card} {trump} size="sm" marked />
    {/each}
  </div>
  <p class="mt-3 text-xs text-white/70">
    底分 <b class="tabular-nums text-gold">{cardsPoints(buried)}</b> 分
  </p>
  <p class="mt-1 text-[11px] leading-relaxed text-white/50">
    末轮由你赢下 = 保底：底分 × 末轮张数加进你的得分；被闲家赢走 = 抠底：同样的倍数从你的得分里扣。
  </p>
{:else if summary !== null}
  <p class="text-xs text-white/60">结算已公开的底牌（底分 {summary.kittyPoints} 分）</p>
  <div class="mt-2 flex justify-center gap-2">
    {#each summary.kitty as card, index (cardKey(card) + index)}
      <CardView {card} trump={summary.trump} size="sm" />
    {/each}
  </div>
{:else}
  <p class="text-xs leading-relaxed text-white/50">
    庄家埋的 3 张要等结算才公开 —— 结算前只有庄家本人看得到，闲家与观战者都看不到。
  </p>
{/if}
