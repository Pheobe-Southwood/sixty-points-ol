<script lang="ts">
  import { cardKey } from '@sixty/engine';
  import type { TableClient } from '$lib/client/table.svelte';
  import CardView from './Card.svelte';

  /**
   * 「底牌」页 = 庄家回看**自己埋下去的那 3 张**（CONTEXT.md 的 **埋下的底牌**）。
   *
   * 这一页只有**一行提示（居中）+ 该看得见的牌面**：规则说明一律归操作条的「?」与 /rules，
   * 这里不写第二遍（早先这一页有三段解释 —— 保底/抠底怎么算、发牌会留下 3 张暗底、
   * 你埋下去了哪三张 —— 说的都是别处已经说过的事）。
   *
   * 七种状态（提示 / 牌面）：
   * ① 还没发牌 —— 还没发牌
   * ② 叫牌中 —— 还没定庄家
   * ③ 结算后（所有人）—— 已公开，底 xx 分 ／ 公开的 3 张
   * ④ 埋底中 · 你是庄家 —— 等待你埋底
   * ⑤ 埋底中 · 其他人 —— 等待庄家埋底
   * ⑥ 埋底后～结算前 · 庄家 —— 底牌仅你可见 ／ 自己埋的 3 张（`you.buriedKitty`）
   * ⑦ 同上 · 闲家与观战 —— 底牌暂对闲家不可见
   *
   * 两处刻意的取舍：
   * - 埋底中**不再镜像**毡面那 3 个待定槽位：毡面上有同一份、而且那里可点（点一下 = 在手牌里
   *   选中），抽屉里再摆一份只是重复；
   * - 观战者与闲家用同一句「暂对闲家不可见」：可见性完全相同，不值得多一句措辞。
   *
   * 数据来自 `you.buriedKitty` —— 服务端权威，刷新、离座、补位接手都不丢（客户端自己记一手会在
   * 刷新后变空）。这不是「拿上来的底牌」（`you.originalKitty`）：那 3 张只活在毡面的埋底面板里。
   */
  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const summary = $derived(deal?.summary ?? null);
  const trump = $derived(deal?.trump ?? null);
  const isDeclarer = $derived(client.you?.isDeclarer === true);
  const buried = $derived(client.you?.buriedKitty ?? null);

  /** 提示只有一行、居中：七种状态共用这一份样式 */
  const hint = 'text-center text-xs text-white/60';
</script>

{#if deal === null}
  <p class={hint}>还没发牌</p>
{:else if deal.phase === 'auction'}
  <p class={hint}>还没定庄家</p>
{:else if summary !== null}
  <p class={hint}>已公开，底 {summary.kittyPoints} 分</p>
  <div class="mt-2 flex justify-center gap-2">
    {#each summary.kitty as card, index (cardKey(card) + index)}
      <CardView {card} trump={summary.trump} size="sm" />
    {/each}
  </div>
{:else if deal.phase === 'bury' && isDeclarer}
  <p class={hint}>等待你埋底</p>
{:else if deal.phase === 'bury'}
  <p class={hint}>等待庄家埋底</p>
{:else if isDeclarer}
  <p class={hint}>底牌仅你可见</p>
  {#if buried !== null}
    <div class="mt-2 flex justify-center gap-2">
      {#each buried as card, index (cardKey(card) + index)}
        <CardView {card} {trump} size="sm" marked />
      {/each}
    </div>
  {/if}
{:else}
  <p class={hint}>底牌暂对闲家不可见</p>
{/if}
