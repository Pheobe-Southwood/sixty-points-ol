<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { TableClient } from '$lib/client/table.svelte';
  import SeatActions from './SeatActions.svelte';
  import SeatCard from './SeatCard.svelte';

  /**
   * 「我」页 = **这个座位 + 我的身份**。
   *
   * 为什么把「观战」与「改名 / 换身份」合成一页：它们是同一条领域规则的两面 ——
   * CONTEXT.md 定死了「改名/换身份只允许在不在座时进行」，所以离座入口与身份表单应当同屏，
   * 「先离座再改名」才是一条能顺着走完的路，而不是两页之间来回跳。
   *
   * 在座时**不给**必定失败的按钮（服务端一律 400）：只说明原因并给出离座入口。
   *
   * 这一页在抽屉关闭时也留在 DOM 里（`inert`），所以「改名 / 换身份」与「座位已满」两处
   * 入口在观战页的 SSR 里始终存在 —— `ui-check` 与 `spectate-check` 守的正是它们。
   */
  let { client, onLeave }: { client: TableClient; onLeave?: () => void } = $props();

  let name = $state('');
  let credential = $state('');
  let done = $state<string | null>(null);

  const view = $derived(client.view);
  const deal = $derived(view?.deal ?? null);
  const seats = $derived(client.table?.seats ?? []);
  const seated = $derived(client.you !== null);
  const mySeat = $derived(client.you?.seat ?? null);
  const free = $derived(seats.some((seat) => seat.userId === null));
  const watchCount = $derived(client.table?.spectatorCount ?? 0);

  const input =
    'min-w-0 flex-1 rounded-lg bg-black/50 px-2.5 py-1.5 text-xs outline-none ring-1 ring-white/15 transition focus:ring-gold';
  const gold =
    'rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-ink transition hover:brightness-110 disabled:opacity-40';
  const ghost =
    'rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-30';

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

<div class="flex items-center gap-2">
  {#if seated}
    <span class="rounded-md bg-gold/20 px-2 py-0.5 text-[11px] font-bold text-gold">在座</span>
  {:else}
    <span class="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-white/70">观战中</span>
  {/if}
  <!-- 口径是「正在看」的实时连接数，不是观战记录条数（见 CONTEXT.md 的 观战者） -->
  <span class="text-[11px] text-white/45">观战人数 {watchCount}</span>
</div>

<div class="mt-3 space-y-1.5">
  {#each seats as seat (seat.seat)}
    <SeatCard
      name={seat.name}
      level={view?.levels[seat.seat] ?? null}
      online={seat.online}
      isMe={mySeat === seat.seat}
      isDeclarer={deal?.declarerSeat === seat.seat}
    />
  {/each}
</div>

<div class="mt-3">
  <SeatActions {client} onLeave={onLeave} />
  <p class="mt-1.5 text-[11px] leading-relaxed text-white/45">
    {#if seated}
      离座后你成为这一桌的观战者，座位空出等补位；这个座位的级别与手牌由下一位入座者继承。
    {:else if free}
      有空座就能补上；这一副还没结算的话，你接下的是这个座位现有的级别与手牌。
    {:else}
      三人都在座：你只能观战，等有人离座再补位。
    {/if}
  </p>
</div>

<h3 class="mt-5 text-sm font-bold">改名 / 换身份</h3>

{#if seated}
  <p class="mt-2 text-[11px] leading-relaxed text-white/50">
    在座时改不了名字或身份 —— 名字与凭据串是这一桌的身份凭据，换掉会让桌上的人认不出你。
    先点上面的「离座」，就会变成观战者，那时这里就能改。
  </p>
{:else}
  <p class="mt-2 text-[11px] leading-relaxed text-white/50">
    名字全局唯一；改名后凭据串会重签（旧串当场失效），新串自动写回本机。
  </p>

  <form
    class="mt-3 flex gap-2"
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
{/if}

{#if done}
  <p class="mt-3 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-200">{done}</p>
{/if}
{#if client.error}
  <p class="mt-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-200">{client.error}</p>
{/if}
