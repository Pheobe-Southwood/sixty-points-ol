<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll, goto } from '$app/navigation';
  import { clearCredential, saveCredential, savedCredential } from '$lib/identity';
  import { parseInvite } from '$lib/invite';
  import { copyText } from '$lib/clipboard';
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
  /** 身份卡的两个 tab。默认「新建账户」：SSR 首屏渲染的就是它，无 JS 也能注册进来。 */
  let identityTab = $state<'new' | 'import'>('new');
  /**
   * 牌桌卡的两个 tab：新建 / 加入。
   * 从邀请链接过来的默认停在「加入已有牌桌」—— 否则 banner 让人「在下面的入座框里填」，
   * 而那个框正躲在另一个 tab 后面。
   */
  let tableTab = $state<'create' | 'join'>(untrack(() => (invited !== null ? 'join' : 'create')));
  let joinCode = $state(untrack(() => data.join ?? ''));
  let busy = $state(false);
  let message = $state<string | null>(null);
  let renameOpen = $state(false);
  let renameName = $state('');
  let renameMessage = $state<string | null>(null);
  let renameDone = $state(false);
  let copied = $state(false);
  /** 复制失败（非安全上下文两条路都不通）时临时亮出凭据串，供手动复制 */
  let credentialShown = $state(false);

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
      renameOpen = false;
      renameDone = true;
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

  /**
   * 复制凭据：走共享的 copyText（非安全上下文没有 Clipboard API，需要 execCommand 回退）。
   * 两条路都不通时不装作成功 —— 亮出凭据串让用户手动复制。
   */
  async function copyCredential(): Promise<void> {
    if (!data.credential) return;
    if (await copyText(data.credential)) {
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } else {
      credentialShown = true;
    }
  }

  const input =
    'min-w-0 flex-1 rounded-lg bg-black/40 px-3 py-2 text-sm outline-none ring-1 ring-white/15 transition focus:ring-gold';
  const primary =
    'rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink transition hover:brightness-110 active:scale-95 disabled:opacity-40';
  const ghost = 'rounded-lg px-4 py-2 text-sm text-white/80 ring-1 ring-white/20 transition hover:bg-white/10 disabled:opacity-40';
  /* 「当前展开的那一个」：金色只表示选中/激活，不表示「主操作」——
     所以复制凭据、登出这类一次性动作永远是普通色（曾经复制凭据是金色，读起来像选中的页签）。 */
  const actionOn =
    'rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink ring-1 ring-gold/60 transition hover:brightness-110 disabled:opacity-40';
  const card = 'rounded-2xl bg-black/30 p-4 ring-1 ring-white/10';
  const cardTitle = 'text-center text-lg font-bold';
  const hint = 'mt-3 text-[11px] leading-relaxed text-white/45';
  const tabButton = (on: boolean): string =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? 'bg-gold text-ink' : 'text-white/70 hover:bg-white/10'}`;
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
  <header class="text-center">
    <p class="text-[10px] tracking-[.4em] text-gold/70">SIXTY POINTS</p>
    <h1 class="mt-1 text-4xl font-black tracking-[.2em] text-ivory">六十分</h1>
  </header>

  {#if message}
    <p class="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">{message}</p>
  {/if}

  <!-- 走到这里说明是被邀请链接带过来的：不管接下来是注册还是导入凭据，都先说清去向 -->
  {#if invited !== null}
    <p class="rounded-xl bg-gold/15 px-3 py-2 text-xs text-gold ring-1 ring-gold/30">
      身份一到位就会自动回到牌桌 <b class="font-mono tracking-widest">{invited}</b>（注册或导入凭据都会）。<br />
      想换一张桌，请在下面的入座框里填另一张桌的邀请码再点「加入」。
    </p>
  {/if}

  {#if data.me === null}
    <!-- 未注册：创建身份。两个 tab 共用 claim()，说明放在各面板底部 -->
    <section class={card}>
      <h2 class={cardTitle}>创建身份</h2>

      <div class="mt-3 flex gap-1 rounded-xl bg-black/40 p-1" role="tablist" aria-label="创建身份">
        <button
          type="button"
          role="tab"
          id="identity-tab-new"
          aria-selected={identityTab === 'new'}
          aria-controls="identity-panel-new"
          class={tabButton(identityTab === 'new')}
          onclick={() => (identityTab = 'new')}
        >
          新建账户
        </button>
        <button
          type="button"
          role="tab"
          id="identity-tab-import"
          aria-selected={identityTab === 'import'}
          aria-controls="identity-panel-import"
          class={tabButton(identityTab === 'import')}
          onclick={() => (identityTab = 'import')}
        >
          导入已有账户
        </button>
      </div>

      <!-- 两面板都保持挂载（hidden 切换）：来回切 tab 不丢已输入的内容 -->
      <div
        id="identity-panel-new"
        role="tabpanel"
        aria-labelledby="identity-tab-new"
        class="mt-3"
        hidden={identityTab !== 'new'}
      >
        <form
          class="flex gap-2"
          onsubmit={(event) => {
            event.preventDefault();
            void claim({ name });
          }}
        >
          <input class={input} placeholder="你的名字（1-12 字）" bind:value={name} maxlength="12" />
          <button type="submit" class={primary} disabled={busy || name.trim().length === 0}>进入</button>
        </form>
        <p class={hint}>无需设置密码，名字不得与已有重复。若此前已有账户，请前往导入已有账户。</p>
      </div>

      <div
        id="identity-panel-import"
        role="tabpanel"
        aria-labelledby="identity-tab-import"
        class="mt-3"
        hidden={identityTab !== 'import'}
      >
        <form
          class="flex gap-2"
          onsubmit={(event) => {
            event.preventDefault();
            void claim({ credential: credentialInput.trim() });
          }}
        >
          <input class={input} placeholder="粘贴凭据串" bind:value={credentialInput} />
          <button type="submit" class={ghost} disabled={busy || credentialInput.trim().length === 0}>导入</button>
        </form>
        <p class={hint}>将其他设备产生的凭据粘贴到输入框中。若第一次玩，或没有之前账户的凭据，请换个名字新建账户。</p>
      </div>
    </section>
  {:else}
    <!-- 已注册：身份 + 三个动作。换身份不再单列：登出后走上面的「导入已有账户」即可。 -->
    <section class={card}>
      <div class="flex flex-col items-center gap-1.5">
        <div class="grid h-12 w-12 place-items-center rounded-full bg-gold/90 text-lg font-bold text-ink ring-2 ring-gold/60">
          {data.me.name.slice(0, 1)}
        </div>
        <p class="text-lg font-bold">{data.me.name}</p>
      </div>

      <!-- 三按钮一律普通色；只有「改名」展开时才由它变金（金色 = 当前展开的那一个） -->
      <div class="mt-4 grid grid-cols-3 gap-2">
        <button type="button" class={ghost} disabled={busy} onclick={() => void copyCredential()}>
          {copied ? '已复制' : '复制凭据'}
        </button>
        <button
          type="button"
          class={renameOpen ? actionOn : ghost}
          disabled={busy}
          onclick={() => {
            renameOpen = !renameOpen;
            renameMessage = null;
          }}
        >
          改名
        </button>
        <button type="button" class={ghost} disabled={busy} onclick={() => void logout()}>登出</button>
      </div>

      {#if renameOpen}
        <form
          class="mt-3 flex gap-2"
          onsubmit={(event) => {
            event.preventDefault();
            void renameSelf();
          }}
        >
          <input class={input} placeholder="新名字（1-12 字）" bind:value={renameName} maxlength="12" />
          <button type="submit" class={primary} disabled={busy || renameName.trim().length === 0}>确认</button>
          <button type="button" class={ghost} onclick={() => (renameOpen = false)}>取消</button>
        </form>
        {#if renameMessage}
          <p class="mt-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-200">{renameMessage}</p>
        {/if}
      {:else if renameDone}
        <p class="mt-3 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-200">已改名，新凭据已写回本机</p>
      {/if}

      {#if credentialShown}
        <code class="mt-3 block break-all rounded-lg bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white/60 ring-1 ring-white/10">
          {data.credential}
        </code>
        <p class="mt-1 text-[10px] text-white/40">此环境无法自动复制，请手动选中复制。</p>
      {/if}

      <p class={hint}>若需要在其他设备继续账户身份，请复制凭据并发送到其他设备。</p>
    </section>

    <!-- 牌桌：新建 / 加入 做成同一套 tab（金色只给选中的那一个 tab） -->
    <section class={card}>
      <h2 class={cardTitle}>牌桌</h2>

      <div class="mt-3 flex gap-1 rounded-xl bg-black/40 p-1" role="tablist" aria-label="牌桌">
        <button
          type="button"
          role="tab"
          id="table-tab-create"
          aria-selected={tableTab === 'create'}
          aria-controls="table-panel-create"
          class={tabButton(tableTab === 'create')}
          onclick={() => (tableTab = 'create')}
        >
          新建牌桌
        </button>
        <button
          type="button"
          role="tab"
          id="table-tab-join"
          aria-selected={tableTab === 'join'}
          aria-controls="table-panel-join"
          class={tabButton(tableTab === 'join')}
          onclick={() => (tableTab = 'join')}
        >
          加入已有牌桌
        </button>
      </div>

      <div
        id="table-panel-create"
        role="tabpanel"
        aria-labelledby="table-tab-create"
        class="mt-3"
        hidden={tableTab !== 'create'}
      >
        <button type="button" class={`${primary} w-full`} disabled={busy} onclick={() => void createTable()}>
          创建牌桌
        </button>
      </div>

      <div
        id="table-panel-join"
        role="tabpanel"
        aria-labelledby="table-tab-join"
        class="mt-3"
        hidden={tableTab !== 'join'}
      >
        <form
          class="flex gap-2"
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
        <h3 class="mt-4 text-xs font-semibold text-white/50">我的牌桌</h3>
        <div class="mt-2 flex flex-col gap-2">
          {#each data.myTables as table (table.code)}
            <!-- 在座的桌与观战的桌都列出来：离座之后大厅里也回得去；整行进桌 -->
            <a
              class="flex min-w-0 items-center gap-2.5 rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/10 transition hover:bg-white/10"
              href={`/table/${table.code}`}
            >
              <span class="shrink-0 font-mono tracking-widest text-gold">{table.code}</span>
              {#if table.role === 'player'}
                <span class="shrink-0 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold">在座</span>
              {:else}
                <span class="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">观战中</span>
              {/if}
              <span class="min-w-0 flex-1 truncate text-right text-xs text-white/60">
                {table.names.join(' / ') || '无人入座'}
              </span>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- 学玩入口对未注册也可见：页头不再带链接，这里是了解玩法的唯一入口。
       两个入口同款底色：金色只表示选中/激活，这里没有选中态，所以谁都不上强调色
       （曾经给「幻灯片」上金色，看起来像「只有它可点」）。 -->
  <div>
    <p class="text-center text-[10px] font-semibold tracking-[.3em] text-white/40">怎么玩</p>
    <div class="mt-2 grid grid-cols-2 gap-2">
      <a
        class="flex flex-col items-center justify-center rounded-2xl bg-black/20 px-4 py-3 ring-1 ring-white/10 transition hover:bg-black/30"
        href="/learn"
      >
        <span class="text-sm font-bold text-white/80">幻灯片讲解入门</span>
        <span class="mt-0.5 text-[10px] text-white/40">推荐</span>
      </a>
      <a
        class="flex flex-col items-center justify-center rounded-2xl bg-black/20 px-4 py-3 ring-1 ring-white/10 transition hover:bg-black/30"
        href="/rules"
      >
        <span class="text-sm font-bold text-white/80">文字版规则说明</span>
      </a>
    </div>
  </div>
</main>
