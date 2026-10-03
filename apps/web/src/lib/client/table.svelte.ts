import { cardKey, type BidCall, type Card, type PublicView } from '@sixty/engine';
import type { PlayerHand, Role, StreamPayload, TableView } from '$lib/shared';
import { saveCredential } from '$lib/identity';
import { checkPlay } from '$lib/labels';

export type ConnectionState = 'connecting' | 'live' | 'offline';

/** 一张同桌的客户端状态：SSE 收负载（角色/视图/手牌）、POST 发动作（座位由服务端决定） */
export class TableClient {
  readonly code: string;
  /** 当前角色：观战者入座后由下一帧负载切换，界面据此增减手牌区与操作区 */
  role = $state<Role>('spectator');
  view = $state<PublicView | null>(null);
  /** 玩家独有的一份信息；观战者为 null */
  you = $state<PlayerHand | null>(null);
  table = $state<TableView | null>(null);
  selected = $state<string[]>([]);
  busy = $state(false);
  error = $state<string | null>(null);
  connection = $state<ConnectionState>('connecting');

  #source: EventSource | null = null;

  constructor(code: string, initial: StreamPayload) {
    this.code = code;
    this.#apply(initial);
  }

  #apply(payload: StreamPayload): void {
    this.role = payload.role;
    this.view = payload.view;
    this.you = payload.you;
    this.table = payload.table;
  }

  connect(): void {
    this.connection = 'connecting';
    const source = new EventSource(`/api/tables/${this.code}/stream`);
    source.onopen = () => {
      this.connection = 'live';
    };
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as StreamPayload;
      this.#apply(payload);
      this.selected = [];
      this.connection = 'live';
    };
    source.onerror = () => {
      this.connection = 'offline';
    };
    this.#source = source;
  }

  disconnect(): void {
    this.#source?.close();
    this.#source = null;
  }

  selectedCards = $derived.by(() => {
    const hand = this.you?.hand ?? [];
    return hand.filter((card) => this.selected.includes(cardKey(card)));
  });

  playError = $derived.by(() => {
    const view = this.view;
    const you = this.you;
    const deal = view?.deal;
    if (!view || !you || !deal || deal.phase !== 'play' || deal.trump === null) return null;
    if (deal.playTurn !== you.seat) return null;
    const cards = this.selectedCards;
    if (cards.length === 0) return null;
    const lead = deal.trick && deal.trick.plays.length > 0 ? deal.trick.plays[0]!.cards : null;
    return checkPlay({ hand: you.hand, trump: deal.trump, lead }, cards);
  });

  toggle(card: Card): void {
    const key = cardKey(card);
    this.selected = this.selected.includes(key)
      ? this.selected.filter((k) => k !== key)
      : [...this.selected, key];
  }

  clearSelection(): void {
    this.selected = [];
  }

  async #request(path: string, init: RequestInit = {}): Promise<unknown> {
    this.busy = true;
    this.error = null;
    try {
      const response = await fetch(path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        this.error = payload?.message ?? `操作失败（${response.status}）`;
        return null;
      }
      this.selected = [];
      return payload;
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : '网络错误';
      return null;
    } finally {
      this.busy = false;
    }
  }

  send(action: unknown): Promise<boolean> {
    return this.#request(`/api/tables/${this.code}/action`, {
      method: 'POST',
      body: JSON.stringify({ action })
    }).then((payload) => payload !== null);
  }

  /** 入座：继承该座位的级别与手牌；角色会随下一帧负载变成 player */
  sit(): Promise<boolean> {
    return this.#request(`/api/tables/${this.code}/seat`, { method: 'POST' }).then((p) => p !== null);
  }

  /** 离座：座位空出、本人转为观战者（服务端幂等） */
  leave(): Promise<boolean> {
    return this.#request(`/api/tables/${this.code}/seat`, { method: 'DELETE' }).then((p) => p !== null);
  }

  /** 改名字：凭据串随名字重签，必须写回 localStorage，否则旧串当场失效 */
  async rename(name: string): Promise<string | null> {
    const payload = (await this.#request('/api/auth/rename', {
      method: 'POST',
      body: JSON.stringify({ name })
    })) as { name?: string; credential?: string } | null;
    if (payload?.credential) saveCredential(payload.credential);
    return payload?.name ?? null;
  }

  /** 换身份：粘贴另一条凭据串（在座时服务端会拒绝，必须先离座） */
  async switchIdentity(credential: string): Promise<boolean> {
    const payload = (await this.#request('/api/auth/claim', {
      method: 'POST',
      body: JSON.stringify({ credential })
    })) as { credential?: string } | null;
    if (payload?.credential) saveCredential(payload.credential);
    return payload !== null;
  }

  bid(call: BidCall): Promise<boolean> {
    return this.send({ type: 'bid', call });
  }

  bury(): Promise<boolean> {
    return this.send({ type: 'bury', cards: this.selectedCards });
  }

  play(): Promise<boolean> {
    return this.send({ type: 'play', cards: this.selectedCards });
  }

  deal(): Promise<boolean> {
    return this.send({ type: 'deal' });
  }

  newGame(): Promise<boolean> {
    return this.send({ type: 'newGame' });
  }
}
