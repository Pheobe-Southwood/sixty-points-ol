<script lang="ts">
  import type { Level } from '@sixty/engine';
  import { levelParts } from '$lib/labels';

  let { level, class: klass = '' }: { level: Level; class?: string } = $props();

  const parts = $derived(levelParts(level));
</script>

<!-- 座位卡与 /rules 教程共用：级别＝档位数字 + 下方 +过次徽标。
     徽标在文档流里（不是绝对定位），间距靠 mt-px + 11px 行高收到约 2px 视觉间隙。 -->
<div class={['text-center', klass]}>
  <span class="block text-base font-bold leading-none tabular-nums">{parts.rank}</span>
  <span
    class="mt-px inline-block whitespace-nowrap rounded-full bg-gold px-1 text-[9px] font-bold leading-[11px] text-ink shadow-sm"
    >+{parts.cycle}</span
  >
</div>
