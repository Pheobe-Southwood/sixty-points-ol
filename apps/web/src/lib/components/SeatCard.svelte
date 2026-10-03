<script lang="ts">
  import type { Level } from '@sixty/engine';
  import LevelBadge from './LevelBadge.svelte';

  let {
    name,
    level = null,
    isMe = false,
    isDeclarer = false,
    isTurn = false,
    online = false,
    class: klass = ''
  }: {
    name: string | null;
    level?: Level | null;
    isMe?: boolean;
    isDeclarer?: boolean;
    isTurn?: boolean;
    online?: boolean;
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

  <div class="flex items-center gap-2.5">
    <div class="relative shrink-0">
      <div
        class={[
          'grid h-9 w-9 place-items-center rounded-full text-sm font-bold ring-2',
          isMe ? 'bg-gold/90 text-ink ring-gold/60' : 'bg-felt-600 ring-white/15',
          isTurn && 'turn-ring animate-pulse'
        ]}
      >
        {name === null ? '空' : name.slice(0, 1)}
      </div>
      {#if !empty}
        <span class={['status-dot', online ? 'online' : 'offline']} title={online ? '在线' : '离线'}></span>
      {/if}
    </div>

    <p class="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">{name ?? '空座'}</p>

    {#if level}
      <LevelBadge {level} class="shrink-0" />
    {/if}
  </div>
</div>
