<script lang="ts">
  import type { PublicView } from '@sixty/engine';
  import { isRedStrain, strainGlyph } from '$lib/labels';

  let {
    view,
    onReviewTrick
  }: {
    view: PublicView;
    /** 「上一轮」回看入口：传入才渲染（内容见 `TrickReview`；不传时这一条仍是纯信息条） */
    onReviewTrick?: () => void;
  } = $props();

  const deal = $derived(view.deal);
  const contract = $derived(deal?.contract ?? null);
  const trickNo = $derived((deal?.trickHistory.length ?? 0) + 1);
  /** 收过墩才有「上一轮」可回看（还没打过牌、或换副重发的当口都没有） */
  const canReview = $derived(onReviewTrick !== undefined && (deal?.trickHistory.length ?? 0) > 0);
  const declarerPoints = $derived(
    contract === null ? 0 : (deal?.captured[contract.declarerSeat]?.points ?? 0)
  );

  /**
   * 定约与「庄已抓」是本副最该被一眼看到的两个数（打牌时决定进退，埋底/结算时是背景），
   * 所以它们是**大号金色数字**，不是和小字同级的 chip；`第 N 轮` 才是陪衬。
   */
  const chip = 'rounded-full bg-black/35 px-2.5 py-1 ring-1 ring-white/10';
  const stat = 'flex items-baseline gap-1.5 rounded-xl bg-black/45 px-3 py-1 ring-1';
  const num = 'text-xl font-black leading-none tabular-nums text-gold sm:text-2xl';
  const label = 'text-[11px] text-white/60';
</script>

<!-- 普通文档流（**不再自己绝对定位**）：由牌桌页把它和埋底面板放进同一个列容器，
     于是短屏上「定约」等信息不会压到埋底槽位上（手机端曾经两处各定各的位置而重叠）。
     不再单列「级牌 X」（庄家座位卡上的级别数字就是它），也不再写「庄已抓 X / 需 Y」
     ——分母就是旁边那个定约分，重复一次只会让状态条更长。 -->
<!-- 普通文档流（**不再自己绝对定位**）：由牌桌页把它和埋底面板放进同一个列容器，
     于是短屏上「定约」等信息不会压到埋底槽位上（手机端曾经两处各定各的位置而重叠）。
     不再单列「级牌 X」（庄家座位卡上的级别数字就是它），也不再写「庄已抓 X / 需 Y」
     ——分母就是旁边那个定约分，重复一次只会让状态条更长。
     纯信息条（没有一个可点元素）⇒ 也让它让开点击：它与座位卡同处一层，窄桌面上会盖住
     座位卡上的动作按钮（「+ 机器人」/「请离」）。
     唯一的例外是「上一轮」那枚回看入口：它自己 pointer-events-auto 把点击接回来，
     整条的 pointer-events-none 照旧 —— 少了那一句，按钮会看得见点不到（BuryPanel 记过这个坑）。 -->
<div class="pointer-events-none flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
  <span class={`${chip} text-[11px] text-white/55`}>第 <b class="tabular-nums text-white/90">{trickNo}</b> 轮</span>
  {#if contract}
    <span class={`${stat} ring-gold/25`}>
      <b class={num}>
        {contract.points}<span class={isRedStrain(contract.strain) ? 'text-rose-300' : ''}>{strainGlyph(
          contract.strain
        )}</span>
      </b>
      <span class={label}>定约</span>
    </span>
    <span class={`${stat} ring-white/10`}>
      <span class={label}>庄已抓</span>
      <b class={num}>{declarerPoints}</b>
      <span class={label}>分</span>
    </span>
  {/if}
  {#if canReview}
    <!-- bot 出手只有 0.5–1.5 秒，收墩后赢家立刻领出下一轮 —— 入口就在这一条状态条上，
         「上一轮」正是相对上面那个轮次号而言的（浮层见 TrickReview）。
         **排在最后**是一条版面判据，不是随手放的：375px 上这一条本来就逼近可用宽度
         （按 Microsoft YaHei 的字宽实算，定约与庄已抓都两位数时：轮次一位数 ~325px、
         两位数 ~331px，可用 ~335px），而它排在末尾时，万一折行被挤到第二行的就是这枚小 chip
         —— 落点在左右两块出牌点之间的空带里，什么都不会被盖住；若挪到「定约」前面，被挤下去的
         会是「庄已抓」那枚大字，正好压在左上那堆牌的角上。px-1.5 也是为了这个余量
         （这条 chip 比其他 chip 窄一档）。判据在 test/table-chrome.test.ts 的 trickReviewCheck。 -->
    <button
      type="button"
      class="pointer-events-auto whitespace-nowrap rounded-full border border-gold/40 px-1.5 py-0.5 text-[11px] font-bold text-gold hover:bg-gold/10"
      onclick={() => onReviewTrick?.()}>上一轮</button
    >
  {/if}
</div>
