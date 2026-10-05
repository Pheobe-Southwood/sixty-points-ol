<script lang="ts">
  import type { ReplayResult } from '$lib/replays';
  import { contractText } from '$lib/labels';
  import ScoreEquation from './ScoreEquation.svelte';
  import VerdictBadge from './VerdictBadge.svelte';

  /**
   * 机器重演入口（ADR-0016）：一枚小按钮 + 展开体，战报逐副卡与结算弹窗共用。
   *
   * - 数据不自己拉：页面持有 `replays` 缓存与 `onOpen`（首次点开某副时整表拉一次，
   *   结果不可变，没有失效问题）；
   * - 展开体**复用结算那三件套**（`contractText` / `ScoreEquation` / `VerdictBadge`）——
   *   与逐副卡同一份标记，弹窗里读到的读法就是这里的读法，不做第二份实现；
   * - 重演是自治的（含叫牌），定约/庄家可能与真实那副不同，所以头行要写重演自己的定约；
   * - 全 pass 是合法终态（约 5% 的副）：一句话交代；拉过之后没有记录的老副也一句话，
   *   不玩「按钮消失」——否则看起来像功能坏了。
   */
  let {
    dealNo,
    replays,
    onOpen,
    who
  }: {
    dealNo: number;
    replays: Readonly<Record<number, ReplayResult>>;
    onOpen: (dealNo: number) => void;
    who: (seat: number) => string;
  } = $props();

  let open = $state(false);
  let requested = $state(false);
  const replay = $derived(replays[dealNo] ?? null);

  /** 每次展开都问一次：页面按「已有就不再拉」去重，于是失败的请求下次点开自然重试 */
  function toggle(): void {
    open = !open;
    if (open) {
      requested = true;
      onOpen(dealNo);
    }
  }
</script>

<button
  type="button"
  aria-expanded={open}
  class="mt-2 text-[11px] text-white/50 transition hover:text-white/80"
  onclick={toggle}
>
  机器重演 {open ? '▴' : '▾'}
</button>

{#if open}
  <div class="mt-2 rounded-lg bg-black/20 p-2 ring-1 ring-white/10">
    {#if replay === null}
      {#if requested}
        <p class="text-white/45">这副没有机器重演记录</p>
      {:else}
        <p class="text-white/45">加载中…</p>
      {/if}
    {:else if replay.kind === 'all-pass'}
      <p class="text-white/55">机器人全 pass · 这副会被作废重发</p>
    {:else}
      <p class="text-white/60">
        机器定约 {contractText(replay.summary)} · 庄家 {who(replay.summary.contract.declarerSeat)}
      </p>
      <div class="mt-2">
        <ScoreEquation summary={replay.summary} compact />
      </div>
      <VerdictBadge summary={replay.summary} class="mt-2" />
    {/if}
  </div>
{/if}
