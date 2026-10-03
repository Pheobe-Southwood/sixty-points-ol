<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { TableClient } from '$lib/client/table.svelte';

  /** 不在座位上时的快捷身份编辑（在座时服务端一律拒绝，见 ADR-0009） */
  let { client }: { client: TableClient } = $props();

  let open = $state(false);
  let name = $state('');
  let credential = $state('');
  let done = $state<string | null>(null);

  const input =
    'min-w-0 flex-1 rounded-lg bg-black/50 px-2.5 py-1.5 text-xs outline-none ring-1 ring-white/15 transition focus:ring-gold';
  const ghost = 'rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10';
  const gold =
    'rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink transition hover:brightness-110 disabled:opacity-40';

  async function rename(): Promise<void> {
    done = null;
    const renamed = await client.rename(name.trim());
    if (renamed !== null) {
      name = '';
      done = `已改名为「${renamed}」，凭据串已更新`;
      await invalidateAll();
    }
  }

  async function swap(): Promise<void> {
    done = null;
    if (await client.switchIdentity(credential.trim())) {
      // 换身份后 cookie 已换人，而 SSE 连接是用旧 cookie 建立的：整页重载重新握手
      window.location.reload();
    }
  }
</script>

<button type="button" class={ghost} onclick={() => (open = true)}>改名 / 换身份</button>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <div class="w-[24rem] max-w-[94vw] rounded-2xl bg-felt-800 p-4 ring-1 ring-gold/30 sm:p-5">
      <div class="flex items-start justify-between gap-2">
        <h2 class="text-sm font-bold">身份</h2>
        <button
          type="button"
          class="rounded-md px-2 text-lg leading-none text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="关闭"
          onclick={() => (open = false)}>×</button
        >
      </div>

      <p class="mt-2 text-[11px] leading-relaxed text-white/50">
        名字全局唯一；改名后凭据串会重签（旧串当场失效），新串自动写回本机。在座时不能改，需先离座。
      </p>

      <form
        class="mt-4 flex gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void rename();
        }}
      >
        <input class={input} placeholder="新名字（1-12 字）" bind:value={name} maxlength="12" />
        <button type="submit" class={gold} disabled={client.busy || name.trim().length === 0}>改名</button>
      </form>

      <form
        class="mt-3 flex gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void swap();
        }}
      >
        <input class={input} placeholder="粘贴另一条凭据串换身份" bind:value={credential} />
        <button
          type="button"
          class={ghost}
          disabled={client.busy || credential.trim().length === 0}
          onclick={() => void swap()}
        >
          换身份
        </button>
      </form>

      {#if done}
        <p class="mt-3 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-200">{done}</p>
      {/if}
      {#if client.error}
        <p class="mt-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-200">{client.error}</p>
      {/if}
    </div>
  </div>
{/if}
