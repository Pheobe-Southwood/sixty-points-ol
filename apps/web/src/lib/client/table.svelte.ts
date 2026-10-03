import { cardKey, type BidCall, type Card, type PersonalView } from '@sixty/engine';
import type { StreamPayload, TableView } from '$lib/shared';
import { checkPlay } from '$lib/labels';

export type ConnectionState = 'connecting' | 'live' | 'offline';

/** 一张同桌的客户端状态：SSE 收视图、POST 发动作（座位由服务端决定） */
export class TableClient {
  readonly code: string;
  view = $state<PersonalView | null>(null);
  table = $state<TableView | null>(null);
  selected = $state<string[]>([]);
  busy = $state(false);
  error = $state<string | null>(null);
  connection = $state<ConnectionState>('connecting');

  #source: EventSource | null = null;

  constructor(code: string, initial: StreamPayload) {
    this.code = code;
    this.view = initial.view;
    this.table = initial.table;
  }

  connect(): void {
    this.connection = 'connecting';
    const source = new EventSource(`/api/tables/${this.code}/stream`);
    source.onopen = () => {
      this.connection = 'live';
    };
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as StreamPayload;
      if (payload.view) this.view = payload.view;
      this.table = payload.table;
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
    const hand = this.view?.you.hand ?? [];
    return hand.filter((card) => this.selected.includes(cardKey(card)));
  });

  playError = $derived.by(() => {
    const view = this.view;
    const deal = view?.deal;
    if (!view || !deal || deal.phase !== 'play' || deal.trump === null) return null;
    if (deal.playTurn !== view.you.seat) return null;
    const cards = this.selectedCards;
    if (cards.length === 0) return null;
    const lead = deal.trick && deal.trick.plays.length > 0 ? deal.trick.plays[0]!.cards : null;
    return checkPlay({ hand: view.you.hand, trump: deal.trump, lead }, cards);
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

  async send(action: unknown): Promise<boolean> {
    this.busy = true;
    this.error = null;
    try {
      const response = await fetch(`/api/tables/${this.code}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        this.error = payload?.message ?? `操作失败（${response.status}）`;
        return false;
      }
      this.selected = [];
      return true;
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : '网络错误';
      return false;
    } finally {
      this.busy = false;
    }
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
