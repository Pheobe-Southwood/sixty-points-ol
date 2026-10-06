<script lang="ts">
  import type { SoundBoard } from '$lib/sound/board.svelte';
  import { VOLUME_MAX, VOLUME_STEP } from '$lib/sound/settings';

  /**
   * 页头右上角的**声音图标 + 弹层**：两条音量滑块（背景音乐 / 音效）+ 一个震动开关。
   *
   * 为什么是音量而不是开关：第一版做的是「音乐开/关、音效开/关」，第一次真听到声音时的反馈
   * 就是「太大」—— 布尔开关没有任何可调空间，只能整条关掉。现在两条通道各有 0~100 的音量，
   * `0` 即静音（等价于旧的「关」），默认 `0`（网页牌桌不自作主张出声）。
   *
   * 为什么不复用 `HelpPopover`：它的「点窗外即关」是裸的 `open = false`，面板里的滑块与开关
   * 动一下就会先把它关掉。这里的关法改成「点在面板里就不关」（见下面的 `onWindowClick`）。
   * 触发按钮那一侧照旧 `stopPropagation`：不然点开的那一下会被 window 这一层立刻关回去。
   *
   * 图标不随音量变化：服务端渲染时读不到 localStorage（拿到的是出厂默认），
   * 若图标按状态换成「静音/有声」两副样子，开着声音的人一进页面就会先看到静音图标再闪一下。
   * 真正的音量在弹层里那两个数上，点开即知。
   *
   * 每行的说明只写「看标签推不出来的那一半」：音乐只在牌桌页、音效是哪四件事、震动只在手机。
   */
  let { board }: { board: SoundBoard } = $props();

  let open = $state(false);
  let panel = $state<HTMLDivElement | null>(null);

  /**
   * 点窗外即关。这里**不用**在面板上挂 `onclick` 吃掉冒泡：那会让 Svelte 的 a11y 检查
   * 认为这个非交互元素既吃点击又要求键盘可达（`a11y_click_events_have_key_events`
   * 与 `a11y_interactive_supports_focus`，而检查是 `--fail-on-warnings`）。
   * 改成在 window 这一层判断「点是不是落在面板里」，面板本身就是普通元素。
   * 触发按钮那一侧的 `stopPropagation` 保留：否则点开的那一下会被这里立刻关掉。
   */
  function onWindowClick(event: MouseEvent): void {
    const target = event.target;
    if (panel !== null && target instanceof Node && panel.contains(target)) return;
    open = false;
  }

  const hint = 'text-[10px] leading-tight text-white/40';
  const value = 'tabular-nums text-[11px] font-bold text-white/70';
  const slider = 'mt-1 w-full accent-gold';
  const row = 'flex cursor-pointer items-center justify-between gap-3 py-1.5';
</script>

<div class="relative">
  <button
    type="button"
    class="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/70 ring-1 ring-white/15 transition hover:bg-white/20"
    title="声音"
    aria-label="声音设置"
    aria-expanded={open}
    onclick={(event) => {
      event.stopPropagation();
      open = !open;
    }}
  >
    <svg
      class="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 6a9 9 0 0 1 0 12" />
    </svg>
  </button>

  {#if open}
    <div
      bind:this={panel}
      class="absolute top-8 right-0 z-40 w-60 rounded-xl bg-black/90 p-3 text-left text-xs text-white/80 ring-1 ring-white/15 backdrop-blur"
      role="dialog"
      aria-label="声音设置"
      tabindex="-1"
      data-sound-menu="true"
    >
      <p class="mb-1 text-sm font-bold text-ivory">声音</p>

      <div class="py-1.5">
        <div class="flex items-center justify-between gap-2">
          <span>
            <span class="block">背景音乐</span>
            <span class={hint}>仅牌桌页 · 切走时暂停</span>
          </span>
          <span class={value} data-music-volume="true">{board.music}</span>
        </div>
        <input
          type="range"
          class={slider}
          min="0"
          max={VOLUME_MAX}
          step={VOLUME_STEP}
          aria-label="背景音乐音量"
          value={board.music}
          oninput={(event) => board.setMusic(event.currentTarget.valueAsNumber)}
        />
      </div>

      <div class="py-1.5">
        <div class="flex items-center justify-between gap-2">
          <span>
            <span class="block">音效</span>
            <span class={hint}>该你了 · 出牌 · 收墩 · 结算</span>
          </span>
          <span class={value} data-sfx-volume="true">{board.sfx}</span>
        </div>
        <input
          type="range"
          class={slider}
          min="0"
          max={VOLUME_MAX}
          step={VOLUME_STEP}
          aria-label="音效音量"
          value={board.sfx}
          oninput={(event) => board.setSfx(event.currentTarget.valueAsNumber)}
        />
      </div>

      <label class={row}>
        <span>
          <span class="block">震动</span>
          <span class={hint}>仅「该你了」· 手机生效</span>
        </span>
        <input
          type="checkbox"
          class="h-4 w-4 accent-gold"
          checked={board.vibration}
          onchange={() => board.setVibration(!board.vibration)}
        />
      </label>
    </div>
  {/if}
</div>

<svelte:window onclick={onWindowClick} />
