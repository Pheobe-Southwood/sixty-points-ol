<script lang="ts">
  import type { Level } from '@sixty/engine';
  import LevelBadge from './LevelBadge.svelte';

  /**
   * 座位卡。默认是**纯展示**（观战页与「牌桌」页只读它）；
   * 机器人相关动作只在调用方显式传回调时出现 —— 毡面传，抽屉里的「牌桌」页不传，
   * 于是「动作面不进抽屉」这条不变式（table-chrome.test.ts）自动成立。
   */
  let {
    name,
    level = null,
    isMe = false,
    isDeclarer = false,
    isTurn = false,
    online = false,
    bot = false,
    canAddBot = false,
    canRemoveBot = false,
    busy = false,
    onAddBot,
    onRemoveBot,
    class: klass = ''
  }: {
    name: string | null;
    level?: Level | null;
    isMe?: boolean;
    isDeclarer?: boolean;
    isTurn?: boolean;
    online?: boolean;
    /** 这个座位是机器人（服务器代打的无凭据身份，见 ADR-0015） */
    bot?: boolean;
    /** 空座且可以加机器人（在座人类、机器人未达上限） */
    canAddBot?: boolean;
    /** 这是机器人座位且当前身份能请它离座（在座人类） */
    canRemoveBot?: boolean;
    /** 有请求在飞：与「入座」「离座」一致，动作按钮一律禁用，防双击连加两个 */
    busy?: boolean;
    onAddBot?: () => void;
    onRemoveBot?: () => void;
    class?: string;
  } = $props();

  const empty = $derived(name === null);
</script>

<div
  class={[
    'rounded-2xl p-2.5 ring-1 backdrop-blur-sm sm:p-3',
    isMe ? 'bg-gold/10 ring-gold/40' : 'bg-black/30 ring-white/10',
    empty && 'opacity-60',
    // 定位类必须只来自调用方：Tailwind 产物里 .relative 排在 .absolute 之后，
    // 同一元素混用两者时 relative 胜出（座位卡会塌回文档流、全挤在毡面左上角）。
    klass.length > 0 ? klass : 'relative'
  ]}
>
  {#if isDeclarer}
    <span
      title="庄家"
      class="absolute -top-3 left-3 text-lg leading-none text-gold drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">♛</span
    >
  {/if}
  {#if isMe}
    <span
      class="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-gold text-[10px] font-bold text-ink shadow"
      >我</span
    >
  {/if}

  <!--
    名字独占一列，装饰不许与它抢同一行。同一行里只有名字是 flex-1、其余全是 shrink-0，宽度会被
    吃干净：实测 176px 的卡能给名字的只剩 23.6px（`w-36` 的手机卡是 0px），而「机器人·小六」
    需要 76px —— 于是机器人只画出「机…」，手机上干脆什么都看不到（人类名「截图玩家」也只剩
    0.4px 余量）。所以：名字进 `min-w-0 flex-1` 的列、去掉 `truncate`（改 `break-words`，
    宁可折行也不隐藏，合法名字上限 12 字），「机器人」徽标下移一行。

    卡高在 ≥640px 时不变：级别徽标实测 40px 高，而「名字 18px + 徽标行 19px」= 37px ≤ 40px。
    `gap-2`（而非 2.5）也是量出来的：名字列 79.6px ≥ 76px，全名正好一行放得下。
    加宽卡片不是替代方案 —— 容下这一行要 ≈240px，640px 视口下会撞上居中的大厅面板。
  -->
  <div class="flex items-center gap-2">
    <div class="relative shrink-0">
      <div
        class={[
          'grid h-9 w-9 place-items-center rounded-full text-sm font-bold ring-2',
          isMe ? 'bg-gold/90 text-ink ring-gold/60' : 'bg-felt-600 ring-white/15',
          isTurn && 'turn-ring animate-pulse'
        ]}
      >
        {name === null ? '空' : bot ? '机' : name.slice(0, 1)}
      </div>
      {#if !empty}
        <span class={['status-dot', online ? 'online' : 'offline']} title={online ? '在线' : '离线'}></span>
      {/if}
    </div>

    <div class="min-w-0 flex-1">
      <p class="break-words text-sm font-semibold leading-tight">{name ?? '空座'}</p>
      {#if bot}
        <span
          class="mt-0.5 inline-block rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/70"
          title="机器人：由服务器代打（没有凭据串，不可能被人冒充）">机器人</span
        >
      {/if}
    </div>

    {#if level}
      <LevelBadge {level} class="shrink-0" />
    {/if}
  </div>

  {#if empty && canAddBot && onAddBot}
    <button
      type="button"
      disabled={busy}
      class="mt-2 w-full rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/70 transition hover:bg-white/10 disabled:opacity-40"
      onclick={onAddBot}
    >
      + 机器人
    </button>
  {:else if bot && canRemoveBot && onRemoveBot}
    <button
      type="button"
      disabled={busy}
      class="mt-2 w-full rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/60 transition hover:bg-white/10 disabled:opacity-40"
      onclick={onRemoveBot}
    >
      请离
    </button>
  {/if}
</div>
