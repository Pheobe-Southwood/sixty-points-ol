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
   *
   * 两档音量（`ghost`）：`solid` 给弹窗与战报的每副卡，`ghost` 给机器重演展开体（ADR-0016）——
   * 展开体是那张卡的枝干，字号更小、底与环退到近乎透明，免得与主卡那枚并列时两枚一起抢眼。
   * 退火**只降音量、不改色相**：赢仍绿、输仍红，唯一的输赢着色来源不许被降权改掉。
   */
  let {
    summary,
    class: klass = '',
    ghost = false
  }: { summary: DealSummary; class?: string; ghost?: boolean } = $props();

  const TONES = {
    solid: {
      box: 'rounded-xl px-4 py-2',
      text: 'text-sm font-bold',
      made: 'bg-emerald-500/15 ring-emerald-400/30 text-emerald-300',
      lost: 'bg-rose-500/15 ring-rose-400/30 text-rose-300'
    },
    ghost: {
      box: 'rounded-lg px-3 py-1.5',
      text: 'text-[11px] font-semibold',
      made: 'bg-emerald-500/5 ring-emerald-400/15 text-emerald-300/70',
      lost: 'bg-rose-500/5 ring-rose-400/15 text-rose-300/70'
    }
  } as const;
  const t = $derived(ghost ? TONES.ghost : TONES.solid);
  const tone = $derived(t[summary.made ? 'made' : 'lost']);
</script>

<div class="text-center ring-1 {t.box} {klass} {tone}">
  <p class="{t.text}">{scoreLineText(summary)}</p>
</div>
