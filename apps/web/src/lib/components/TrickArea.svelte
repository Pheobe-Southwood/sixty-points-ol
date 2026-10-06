<script lang="ts">
  import type { PublicView } from '@sixty/engine';
  import { lastCompletedTrick, trickSideBadge, whoLabel } from '$lib/labels';
  import TrickCluster from './TrickCluster.svelte';

  let {
    view,
    seat,
    mySeat = seat,
    names = []
  }: {
    view: PublicView;
    /** 布局锚点：玩家的座位（观战者用固定锚点，见 role.ts） */
    seat: number;
    /** 文案里的「我的座位」：观战者传 -1，于是所有座位都显示玩家名 */
    mySeat?: number;
    names?: readonly (string | null)[];
  } = $props();

  const deal = $derived(view.deal);
  const trump = $derived(deal?.trump ?? null);

  /** 我正在看的一墩：当前墩已有出牌就看当前，否则回看上一条已完成的墩 */
  const current = $derived(deal?.trick ?? null);
  // 「上一轮」只有一处定义（labels.ts）：bot 领出得再快，回看浮层读的也是同一份
  const previous = $derived(lastCompletedTrick(deal));
  const showingCurrent = $derived(current !== null && current.plays.length > 0);
  const plays = $derived(showingCurrent ? current!.plays : (previous?.plays ?? []));
  const winnerSeat = $derived(showingCurrent ? null : (previous?.winnerSeat ?? null));
  const trickPoints = $derived(showingCurrent ? 0 : (previous?.points ?? 0));
  const declarerSeat = $derived(deal?.declarerSeat ?? null);

  const leftSeat = $derived((seat + 1) % 3);
  const rightSeat = $derived((seat + 2) % 3);

  /**
   * 三家方位：左（下家）左上、右（上家）右上、我正中下；窄屏上下错开避免两墩重叠。
   *
   * 窄屏右侧墩用 `right-[20%]` 而不是 `right-[6%]`：右边缘常驻着活页签条（宽约 28px），
   * `6%` 时宽一点的顺子会被页签盖住几张，`20%` 就把这一墩让开了（`sm+` 本来就取 24%）。
   */
  function spotOf(target: number): string {
    if (target === leftSeat) return 'absolute left-[6%] top-36 sm:left-[24%] sm:top-[36%]';
    if (target === rightSeat) return 'absolute right-[20%] top-56 sm:right-[24%] sm:top-[36%]';
    return 'absolute inset-x-0 bottom-[20%]';
  }
</script>

<!-- 首次领出前桌面是空的：不写任何提示，规则说明只在「?」弹层里。
     上一墩的金色徽标只报「这 N 分归庄方还是闲方」（`trickSideBadge`）——
     赢家是谁由牌堆上方那行玩家名说，徽标再重复一遍名字只是把字号浪费在已知信息上。 -->
{#each plays as play (play.seat)}
  <div class={spotOf(play.seat)}>
    <TrickCluster
      cards={play.cards}
      {trump}
      caption={whoLabel(names, mySeat, play.seat)}
      badge={winnerSeat === play.seat ? trickSideBadge(declarerSeat, play.seat, trickPoints) : null}
    />
  </div>
{/each}
