<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll, goto } from '$app/navigation';
  import { clearCredential, saveCredential, savedCredential } from '$lib/identity';
  import { parseInvite } from '$lib/invite';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  /**
   * 链接带来的邀请码：只在挂载时取一次。
   *
   * 它是**唯一的跳转真相** —— 提示文案与 claim() 之后的跳转都读这一个值，
   * 入座框（joinCode）只属于「加入」按钮。曾经跳转读 `data.join` 而输入框另存一份，
   * 屏幕上宣告的目的地会随一个无关输入变化（也触发了 state_referenced_locally 警告）。
   */
  const invited = untrack(() => data.join);

  let name = $state('');
  let credentialInput = $state('');
  let joinCode = $state(untrack(() => data.join ?? ''));
  let busy = $state(false);
  let message = $state<string | null>(null);
  let renameName = $state('');
  let renameMessage = $state<string | null>(null);
  let switchInput = $state('');
  let copied = $state(false);

  /** 输入即归一化：粘贴完整邀请链接时立刻换成 6 位邀请码，否则原样保留 */
  function normalizeJoinInput(raw: string): string {
    return parseInvite(raw) ?? raw;
  }

  // 浏览器里若有本地凭据但服务端没认出来（换浏览器/清了 cookie），自动申领一次
  $effect(() => {
    if (data.me !== null) return;
    const saved = savedCredential();
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
        else clearCredential();
        return;
      }
      if (payload?.credential) saveCredential(payload.credential);
      switchInput = '';
      // 从邀请链接被带到大厅的：身份一到位就直接回到那张桌，不必重新粘贴一次链接
      if (invited !== null) {
        await goto(`/table/${invited}`);
        return;
      }
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  /** 改名字：服务端会回发重签后的凭据串，必须写回本机（旧串当场失效） */
  async function renameSelf(): Promise<void> {
    busy = true;
    renameMessage = null;
    try {
      const response = await fetch('/api/auth/rename', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: renameName.trim() })
      });
      const payload = (await response.json().catch(() => null)) as
        | { name?: string; credential?: string; message?: string }
        | null;
      if (!response.ok) {
        renameMessage = payload?.message ?? '改名失败';
        return;
      }
      if (payload?.credential) saveCredential(payload.credential);
      renameName = '';
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  async function logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
    clearCredential();
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
      <a class="font-semibold text-gold hover:underline" href="/learn">规则演示</a>
    </p>
  </header>

  {#if message}
    <p class="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">{message}</p>
  {/if}

  <!-- 走到这里说明是被邀请链接带过来的：不管接下来是注册、导入还是换身份，都先说清去向 -->
  {#if invited !== null}
    <p class="rounded-xl bg-gold/15 px-3 py-2 text-xs text-gold ring-1 ring-gold/30">
      身份一到位就会自动回到同桌 <b class="font-mono tracking-widest">{invited}</b>（注册、导入凭据或换身份都会）。<br />
      想换一张桌，请在下面的入座框里填另一张桌的邀请码再点「加入」。
    </p>
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

      <form
        class="mt-3 flex gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void renameSelf();
        }}
      >
        <input class={input} placeholder="改名字（1-12 字）" bind:value={renameName} maxlength="12" />
        <button type="submit" class={ghost} disabled={busy || renameName.trim().length === 0}>改名</button>
      </form>
      {#if renameMessage}
        <p class="mt-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-200">{renameMessage}</p>
      {/if}
      <p class="mt-1.5 text-[10px] leading-relaxed text-white/40">
        在座时改不了名字或身份：先在同桌页点「离座」。改名后凭据串会重签，新串会自动写回本机。
      </p>

      <details class="mt-3 text-xs text-white/60">
        <summary class="cursor-pointer hover:text-white">换身份？粘贴另一条凭据</summary>
        <div class="mt-2 flex gap-2">
          <input class={input} placeholder="粘贴凭据串" bind:value={switchInput} />
          <button
            type="button"
            class={ghost}
            disabled={busy || switchInput.trim().length === 0}
            onclick={() => void claim({ credential: switchInput.trim() })}
          >
            换身份
          </button>
        </div>
      </details>
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
              <!-- 在座的桌与观战的桌都列出来：离座之后大厅里也回得去 -->
              <span class="text-white/45">
                {table.role === 'player' ? `${table.seated} 人入座` : '观战中'}
              </span>
            </a>
          {/each}
        </div>
      {/if}
    </section>

    <a
      class="flex items-center justify-between gap-3 rounded-2xl bg-black/20 p-4 ring-1 ring-white/10 transition hover:bg-black/30"
      href="/learn"
    >
      <span>
        <span class="block text-sm font-bold text-white/80">规则演示（幻灯片）</span>
        <span class="mt-0.5 block text-[11px] leading-relaxed text-white/50">
          基本概念十几屏讲清楚，再用三副真实牌局从叫牌走到结算：每一步都有讲解，能自动播放
        </span>
      </span>
      <span class="shrink-0 text-gold">→</span>
    </a>
    <a class="self-center text-[11px] text-white/40 hover:text-white" href="/rules">想逐段查证规则？看文字教程 →</a>
  {/if}
</main>
