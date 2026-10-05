<script lang="ts">
  import type { DealSummary } from '@sixty/engine';
  import { scoreLineText } from '$lib/labels';

  /**
   * 结算结论**只有一行**（`scoreLineText`）：打输 `50/55（差 5 分）· 闲家升 1 级`、
   * 打成 `打成 65/60 · 庄家升 2 级`。打输时「差 N 分」自己就把输赢说了，所以不再写「打输」二字；
   * 打成没有对应的余量说法（恰好打平时「超 0 分」是句怪话），保留「打成」。
   *
   * 底色与文字色（emerald / rose）是**唯一**的输赢着色来源。弹窗与战报共用这一枚 ——
   * 复盘时在弹窗里读到的那一句，就是战报里那一句。
   */
  let { summary, class: klass = '' }: { summary: DealSummary; class?: string } = $props();
</script>

<div
  class="rounded-xl px-4 py-2 text-center ring-1 {klass} {summary.made
    ? 'bg-emerald-500/15 ring-emerald-400/30'
    : 'bg-rose-500/15 ring-rose-400/30'}"
>
  <p class="text-sm font-bold {summary.made ? 'text-emerald-300' : 'text-rose-300'}">
    {scoreLineText(summary)}
  </p>
</div>
