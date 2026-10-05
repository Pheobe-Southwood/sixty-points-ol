<script lang="ts">
  import type { Level } from '@sixty/engine';
  import { levelParts, levelTone } from '$lib/labels';

  let { level, class: klass = '' }: { level: Level; class?: string } = $props();

  const parts = $derived(levelParts(level));
  const tone = $derived(levelTone(level.cycle));
</script>

<!--
  座位卡与 /rules 教程共用：级别＝档位数字 + 下方金色「+过次」徽标。

  间距必须**显式**给，别指望 leading-*：徽标若是 `inline-block`，它就落在一个行盒里，而那个
  行盒的高度由**继承来的** `line-height` 撑出来（Tailwind preflight：16px × 1.5 = 24px），
  `mt-*` 与 `leading-[11px]` 只管徽标自己的盒子 —— 实测档位数字与徽标之间会空出 **9.5px**
  （根高 40 = 16 + 24），而不是这里曾经写的「约 2px 视觉间隙」。那个数还会随调用处继承的行高
  漂移（父级 `line-height: 1` 时变 5.5px），所以站在座位卡上调它永远调不出来。

  改法：徽标走 `block` + `w-fit`（块级盒子里没有行盒）+ `mx-auto` 保住水平居中，间距就等于
  `mt-1` = **4px**，与调用处无关：根高 31 = 16（档位）+ 4 + 11（徽标）。

  **轮数不靠「点数大写」表达**：它是 `13 × 轮数 + 档位序号` 里权重 13 的那一项，只放大档位会
  把跨 A 的升级看成掉级（`A(+0)`=12 < `2(+1)`=13）。所以主数字与药丸一起按轮数加深金色
  （见 `labels.ts` 的 `levelTone`），且只用不参与布局的属性 —— 徽标盒子逐像素不变。
-->
<div class={['text-center', klass]}>
  <span class={['block text-base font-bold leading-none tabular-nums', tone.rank]}>{parts.rank}</span>
  <span
    class={[
      'mt-1 block w-fit mx-auto whitespace-nowrap rounded-full bg-gold px-1 text-[9px] font-bold leading-[11px] text-ink shadow-sm',
      tone.pill
    ]}
    >+{parts.cycle}</span
  >
</div>
