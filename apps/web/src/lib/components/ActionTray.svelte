<script lang="ts">
  import type { TableClient } from '$lib/client/table.svelte';

  let { client }: { client: TableClient } = $props();

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const selectedCount = $derived(client.selected.length);
  const me = $derived(client.you);

  /**
   * 只有「这一手归你动」时才存在：打牌轮到你、或埋底轮到庄家。
   * 观战者两样都不成立（`me` 为 null），不必再写一套分支。
   */
  const visible = $derived(
    deal !== null &&
      me !== null &&
      ((deal.phase === 'play' && deal.playTurn === me.seat) ||
        (deal.phase === 'bury' && me.isDeclarer))
  );

  /**
   * 三个 class 常量都带 `whitespace-nowrap`：窄屏上「出 牌」「清 空」「确认埋底」被压缩时，
   * CJK 可以在任意字间断行，动词会竖排成两行（截图里的那次返工）。
   */
  const gold =
    'whitespace-nowrap rounded-lg bg-gold px-4 py-1.5 text-xs font-bold text-ink transition enabled:hover:brightness-110 disabled:opacity-30';
  const ghost =
    'whitespace-nowrap rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30';
  /**
   * 主操作与旁边同级尺寸（一行的形状由它决定）：早先它是 `px-7 py-2.5 text-base` + 44px 命中高度，
   * 在一行里显得又高又胖，把整条托盘撑得比手牌还抢眼。`disabled:opacity-40`（而不是 30）
   * 让它没选牌时不像一坨灰的禁用态；`.play-btn` 只剩 z-index 与 36px 命中高度（见 app.css）。
   */
  const play =
    'play-btn inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-gold px-5 py-1.5 text-sm font-bold tracking-wide text-ink shadow-[0_4px_14px_-6px_rgba(216,180,90,.7)] transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-40';

  /** 计数在左、动作在中、清空在右 —— 两个阶段同一形状，宽度可算（窄屏一行放得下） */
  const count = 'whitespace-nowrap text-xs text-white/70';
</script>

<!-- 动作托盘 = 「轮到你了」的那一套控件，**独立成层、钉在操作条正上方**：
     ① `bottom-full` 而不是居中悬在操作条上 —— 手牌在操作条**下面**，所以它结构上压不到手牌；
        操作条右端的「距上一步」也不再被它切掉（截图里那两处就是这么来的）。
        代价：短屏上它浮在毡面下半部，可能压住自己左下角那张座位卡 —— 手牌才是必须点得到的东西。
     ② **单行不换行**（`flex-nowrap`）：早先是 `flex-wrap`，窄屏上「清空」与红字各自挤出一行，
        托盘被撑到近 180px 高，正好盖住手牌上半截。
     ③ `absolute` 不占流，所以轮到自己/轮空之间切换时毡面与手牌**零回流**。
     ④ `z-30` 压过 ActionBar(z-10)；居中悬在手牌上方，桌面端从手牌中心到按钮的鼠标路程最短。
     ⑤ `w-max` 是**宽度**修理，不是排版偏好：`absolute` + `left-1/2` + 宽度 auto 时，shrink-to-fit
        的可用宽度只有**半个**容器（手机上约 170px），内容约 206px ⇒ flex 子项被压缩，
        而 CJK 可以在任意字间断行，「出 牌」「清 空」于是竖排成两行（计数的 `whitespace-nowrap`
        让它断不了，截图里「已选 0 张」安然无恙、两个按钮都竖着，正是这条的证据）。
        宽度取 max-content 后没有负空间可分配；按钮自己再带 `whitespace-nowrap` 作第二道防线。
        不加上限：托盘最宽态（埋底）约 250px，320px 机型放得下 —— 反过来加 `max-w-*` 会把它拽回
        「被钳住 ⇒ 压缩 ⇒ 换行」那个形状。
     它只出现在该你出手时，所以不会与「?」的弹层抢位置（弹层向上开、在左侧）。 -->
{#if visible}
  <div
    class="absolute bottom-full left-1/2 z-30 mb-1 flex w-max -translate-x-1/2 flex-nowrap items-center gap-2 rounded-2xl bg-black/55 px-2.5 py-1 ring-1 ring-white/10 backdrop-blur-sm"
    data-action-tray="true"
  >
    {#if deal?.phase === 'bury'}
      <span class={count}>已选 <b class="tabular-nums text-gold">{selectedCount}</b> / 3</span>
      <button
        type="button"
        class={gold}
        disabled={selectedCount !== 3 || client.busy}
        onclick={() => void client.bury()}
      >
        确认埋底
      </button>
    {:else}
      <span class={count}>已选 <b class="tabular-nums text-gold">{selectedCount}</b> 张</span>
      <button
        type="button"
        class={play}
        disabled={selectedCount === 0 || client.playError !== null || client.busy}
        onclick={() => void client.play()}
      >
        出 牌
      </button>
    {/if}
    <button type="button" class={ghost} disabled={selectedCount === 0} onclick={() => client.clearSelection()}>
      清空
    </button>

    <!-- 不合法的选牌原因：**绝对定位浮在托盘上方**，不进托盘的流 ——
         `playError` 是实时推导的（选到不合法的一组就立刻出现），若让它占一行，托盘的高度就会
         随选择来回变，窄屏上正好把手牌压掉。长句自己折行、向上长（毡面那边有空）。 -->
    {#if client.playError}
      <span
        class="absolute bottom-full left-1/2 mb-1 w-max max-w-[min(92vw,22rem)] -translate-x-1/2 rounded-lg bg-black/70 px-2 py-1 text-center text-[11px] text-red-300 ring-1 ring-red-400/20"
        data-play-error="true"
      >
        {client.playError}
      </span>
    {/if}
  </div>
{/if}
