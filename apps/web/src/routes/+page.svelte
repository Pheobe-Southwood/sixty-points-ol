<script lang="ts">
  import { invalidateAll, goto } from '$app/navigation';
  import { parseInvite } from '$lib/invite';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  let name = $state('');
  let credentialInput = $state('');
  let joinCode = $state('');
  let busy = $state(false);
  let message = $state<string | null>(null);
  let copied = $state(false);

  const STORAGE_KEY = 'sixty.credential';

  /** 输入即归一化：粘贴完整邀请链接时立刻换成 6 位邀请码，否则原样保留 */
  function normalizeJoinInput(raw: string): string {
    return parseInvite(raw) ?? raw;
  }

  // 浏览器里若有本地凭据但服务端没认出来（换浏览器/清了 cookie），自动申领一次
  $effect(() => {
    if (data.me !== null) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    void claim({ credential: saved }, true);
  });

  async function claim(body: { name?: string; credential?: string }, silent = false): Promise<void> {
    busy = true;
    message = null;
    try {
      const response = await fetch('/api/auth/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = (await response.json().catch(() => null)) as
        | { credential?: string; name?: string; message?: string }
        | null;
      if (!response.ok) {
        if (!silent) message = payload?.message ?? '操作失败';
        else localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (payload?.credential) localStorage.setItem(STORAGE_KEY, payload.credential);
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  async function logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem(STORAGE_KEY);
    await invalidateAll();
  }

  async function createTable(): Promise<void> {
    busy = true;
    message = null;
    try {
      const response = await fetch('/api/tables', { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      if (!response.ok || !payload?.code) {
        message = payload?.message ?? '创建失败';
        return;
      }
      await goto(`/table/${payload.code}`);
    } finally {
      busy = false;
    }
  }

  async function joinTable(): Promise<void> {
    // 接受裸码，也接受直接粘贴的邀请链接
    const code = parseInvite(joinCode);
    if (code === null) {
      message = '没识别出邀请码：可以直接粘贴邀请链接';
      return;
    }
    busy = true;
    message = null;
    try {
      const response = await fetch(`/api/tables/${code}/join`, { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        message = payload?.message ?? '加入失败';
        return;
      }
      await goto(`/table/${code}`);
    } finally {
      busy = false;
    }
  }

  async function copyCredential(): Promise<void> {
    if (!data.credential) return;
    await navigator.clipboard.writeText(data.credential);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  const input =
    'min-w-0 flex-1 rounded-lg bg-black/40 px-3 py-2 text-sm outline-none ring-1 ring-white/15 transition focus:ring-gold';
  const primary =
    'rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink transition hover:brightness-110 active:scale-95 disabled:opacity-40';
  const ghost = 'rounded-lg px-4 py-2 text-sm text-white/80 ring-1 ring-white/20 transition hover:bg-white/10 disabled:opacity-40';
  const card = 'rounded-2xl bg-black/30 p-4 ring-1 ring-white/10';
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
  <header class="text-center">
    <p class="text-[10px] tracking-[.4em] text-gold/70">SIXTY POINTS</p>
    <h1 class="mt-1 text-4xl font-black tracking-[.2em] text-ivory">六十分</h1>
    <p class="mt-2 text-xs text-white/60">
      三人 1v2 · 桥牌式叫牌 · 双升式打牌与升级 ·
      <a class="font-semibold text-gold hover:underline" href="/rules">新手教程</a>
    </p>
  </header>

  {#if message}
    <p class="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">{message}</p>
  {/if}

  {#if data.me === null}
    <section class={card}>
      <h2 class="text-sm font-bold">创建身份</h2>
      <p class="mt-1 text-[11px] text-white/45">无需密码：凭据串就是身份，复制到别的浏览器粘贴即可继续。</p>
      <form
        class="mt-3 flex gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void claim({ name });
        }}
      >
        <input class={input} placeholder="你的名字（1-12 字）" bind:value={name} maxlength="12" />
        <button type="submit" class={primary} disabled={busy || name.trim().length === 0}>进入</button>
      </form>

      <details class="mt-3 text-xs text-white/60">
        <summary class="cursor-pointer hover:text-white">已有凭据？粘贴导入</summary>
        <div class="mt-2 flex gap-2">
          <input class={input} placeholder="粘贴凭据串" bind:value={credentialInput} />
          <button
            type="button"
            class={ghost}
            disabled={busy || credentialInput.trim().length === 0}
            onclick={() => void claim({ credential: credentialInput.trim() })}
          >
            导入
          </button>
        </div>
      </details>
    </section>
  {:else}
    <section class={card}>
      <div class="flex items-center gap-2.5">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/90 text-sm font-bold text-ink ring-2 ring-gold/60">
          {data.me.name.slice(0, 1)}
        </div>
        <p class="min-w-0 flex-1 truncate text-sm font-semibold">{data.me.name}</p>
        <button type="button" class="shrink-0 text-xs text-white/50 hover:text-white" onclick={logout}>退出</button>
      </div>

      <div class="mt-3 flex items-center gap-2">
        <code class="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/60 ring-1 ring-white/10">
          {data.credential}
        </code>
        <button
          type="button"
          class="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 ring-1 ring-white/15 hover:bg-white/10"
          onclick={copyCredential}
        >
          {copied ? '已复制' : '复制凭据'}
        </button>
      </div>
    </section>

    <section class={card}>
      <h2 class="text-sm font-bold">开桌 / 入桌</h2>
      <div class="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" class={primary} disabled={busy} onclick={createTable}>创建同桌</button>
        <form
          class="flex min-w-0 flex-1 gap-2"
          onsubmit={(event) => {
            event.preventDefault();
            void joinTable();
          }}
        >
          <input
            class={[input, 'font-mono uppercase tracking-widest']}
            placeholder="邀请码或邀请链接"
            value={joinCode}
            oninput={(event) => (joinCode = normalizeJoinInput(event.currentTarget.value))}
          />
          <button type="submit" class={ghost} disabled={busy || joinCode.trim().length === 0}>加入</button>
        </form>
      </div>

      {#if data.myTables.length > 0}
        <div class="mt-3 flex flex-wrap gap-1.5">
          {#each data.myTables as table (table.code)}
            <a
              class="flex items-center gap-2 rounded-full bg-black/30 px-3 py-1 text-xs ring-1 ring-white/10 hover:bg-white/10"
              href={`/table/${table.code}`}
            >
              <span class="font-mono tracking-widest text-gold">{table.code}</span>
              <span class="text-white/45">{table.seated} 人入座</span>
            </a>
          {/each}
        </div>
      {/if}
    </section>

    <a
      class="flex items-center justify-between gap-3 rounded-2xl bg-black/20 p-4 ring-1 ring-white/10 transition hover:bg-black/30"
      href="/rules"
    >
      <span>
        <span class="block text-sm font-bold text-white/80">新手教程</span>
        <span class="mt-0.5 block text-[11px] leading-relaxed text-white/50">
          用真实牌面走一遍：叫牌 → 埋底 → 打牌 → 结算升级，附打牌推论与三道练手题
        </span>
      </span>
      <span class="shrink-0 text-gold">→</span>
    </a>
  {/if}
</main>
