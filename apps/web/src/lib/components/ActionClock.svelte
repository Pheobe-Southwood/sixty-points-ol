<script lang="ts">
  import { formatElapsed } from '$lib/labels';

  let { ageMs = null, class: klass = '' }: { ageMs?: number | null; class?: string } = $props();

  /**
   * 本地锚点：`null` = 还没接管（SSR 与首帧直接用服务端给的年龄）。
   * 每次负载更新（= 每一帧）都重新锚定一次，所以帧之间的走时完全由本地钟负责，
   * 而**真相始终来自服务端**：浏览器不需要、也不许拿自己的钟去对服务端的钟。
   */
  let anchorAt = $state<number | null>(null);
  let tick = $state(0);

  $effect(() => {
    if (ageMs === null) {
      anchorAt = null;
      return;
    }
    anchorAt = Date.now();
  });

  // ageMs 为 null（这一桌还没发过牌）时不走时：没有「上个动作」可计
  $effect(() => {
    if (ageMs === null) return;
    const id = setInterval(() => (tick += 1), 1000);
    return () => clearInterval(id);
  });

  const elapsed = $derived.by(() => {
    void tick; // 让下面这行随时钟重算（Date.now() 本身不是响应式的）
    if (ageMs === null) return null;
    return anchorAt === null ? ageMs : ageMs + Math.max(0, Date.now() - anchorAt);
  });
</script>

<!-- 「距上一步 NN 秒」：操作条那一行唯一的实时状态旁边的一个数。
     它只报「多久没人动」，不做任何超时/催促（见 CONTEXT.md 的「计时」）。
     非空即渲染：`null` 表示这一桌还没发过牌，那时没有「上个动作」可说。 -->
{#if elapsed !== null}
  <span class={['shrink-0 text-[11px] tabular-nums text-white/40', klass]} data-action-clock="true">
    距上一步 {formatElapsed(elapsed)}
  </span>
{/if}
