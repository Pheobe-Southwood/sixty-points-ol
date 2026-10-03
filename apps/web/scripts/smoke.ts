/**
 * 三人线上对局冒烟测试：用 3 个身份走 HTTP API 打完若干副。
 * 服务器权威：本脚本自己挑候选出牌，合法性完全由服务端判定。
 * 运行：node scripts/smoke.ts   （服务端需已启动，BASE 可覆盖地址）
 */
const BASE = process.env['BASE'] ?? 'http://127.0.0.1:5178';
const DEALS_TO_PLAY = Number(process.env['DEALS'] ?? 3);

import { writeFileSync } from 'node:fs';

interface Credential {
  name: string;
  credential: string;
}

interface View {
  version: number;
  status: 'playing' | 'finished';
  dealNo: number;
  dealerSeat: number;
  levels: { rank: number; cycle: number }[];
  deal: {
    phase: 'auction' | 'bury' | 'play' | 'scored';
    auctionTurn: number;
    playTurn: number | null;
    handCounts: number[];
    highestBid: { points: number; strain: string } | null;
    trump: { strain: string; rank: number } | null;
    trick: { leaderSeat: number; plays: { seat: number; cards: Card[] }[] } | null;
    contract: { points: number; strain: string; declarerSeat: number } | null;
  } | null;
  you: { seat: number; hand: Card[] };
}

type Card = { suit?: string; rank?: number; joker?: string };

const SUITS = ['C', 'D', 'H', 'S'];

function cardKey(card: Card): string {
  return card.joker ? (card.joker === 'small' ? 'j0' : 'j1') : `${card.suit}${card.rank}`;
}

function cardClass(card: Card, trump: { strain: string; rank: number }): string {
  if (card.joker) return 'T';
  if (card.rank === trump.rank) return 'T';
  if (trump.strain !== 'NT' && card.suit === trump.strain) return 'T';
  return card.suit!;
}

function cardLevel(card: Card, trump: { strain: string; rank: number }): number {
  const skip = (rank: number, removed: number) => (rank < removed ? rank - 1 : rank - 2);
  if (card.joker) return trump.strain === 'NT' ? (card.joker === 'small' ? 2 : 3) : card.joker === 'small' ? 15 : 16;
  if (trump.strain === 'NT') return card.rank === trump.rank ? 1 : skip(card.rank!, trump.rank);
  if (card.suit === trump.strain) return card.rank === trump.rank ? 14 : skip(card.rank!, trump.rank);
  return card.rank === trump.rank ? 13 : skip(card.rank!, trump.rank);
}

function combinations<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (acc.length === n) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]!);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

let requests = 0;
let rejects = 0;

async function api(path: string, init: RequestInit = {}, credential?: string): Promise<unknown> {
  requests += 1;
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (credential) headers['authorization'] = `Bearer ${credential}`;
  if (init.body) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await response.text();
  const payload = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) {
    rejects += 1;
    throw new Error(`${path} → ${response.status} ${(payload as { message?: string })?.message ?? text}`);
  }
  return payload;
}

async function tryAction(code: string, credential: string, action: unknown): Promise<string | null> {
  requests += 1;
  const response = await fetch(`${BASE}/api/tables/${code}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
    body: JSON.stringify({ action })
  });
  if (response.ok) return null;
  rejects += 1;
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message ?? `HTTP ${response.status}`;
}

async function view(code: string, credential: string): Promise<View | null> {
  const payload = (await api(`/api/tables/${code}/view`, {}, credential)) as { view: View | null };
  return payload.view;
}

/** 候选出牌：先按规则圈定门类，再逐个试（服务端是唯一裁判） */
function candidates(view: View, seat: number, n: number): Card[][] {
  const deal = view.deal!;
  const trump = deal.trump!;
  const hand = view.you.hand;
  const lead = deal.trick && deal.trick.plays.length > 0 ? deal.trick.plays[0]!.cards : null;
  if (lead === null) return hand.map((card) => [card]);

  const leadClass = cardClass(lead[0]!, trump);
  const holding = hand.filter((card) => cardClass(card, trump) === leadClass);
  if (holding.length >= n) {
    const total = combinations(holding, n);
    if (total.length <= 6000) return shuffle(total);
    const sampled: Card[][] = [];
    for (let i = 0; i < 6000; i++) sampled.push(sampleSubset(holding, n));
    return sampled;
  }
  const others = hand.filter((card) => cardClass(card, trump) !== leadClass);
  const need = n - holding.length;
  const combos = combinations(others, need);
  const pool = combos.length <= 4000 ? combos : Array.from({ length: 4000 }, () => sampleSubset(others, need));
  return pool.map((extra) => [...holding, ...extra]);
}

function sampleSubset<T>(items: T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  }
  return out;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function playOneLegalMove(code: string, credential: string, seat: number): Promise<void> {
  const current = await view(code, credential);
  if (current === null || current.deal === null) throw new Error('出牌阶段却拿不到牌局视图');
  const deal = current.deal;
  const n = deal.trick && deal.trick.plays.length > 0 ? deal.trick.plays[0]!.cards.length : 1;
  for (const cards of candidates(current, seat, n)) {
    const error = await tryAction(code, credential, { type: 'play', cards });
    if (error === null) return;
  }
  throw new Error(`座位 ${seat} 找不到合法出牌（手牌 ${current.you.hand.map(cardKey).join(',')}）`);
}

/** SSE：连接后应先收到一条初始视图，动作后应再推送一条新视图 */
async function checkSse(code: string, credential: string): Promise<unknown> {
  const controller = new AbortController();
  const response = await fetch(`${BASE}/api/tables/${code}/stream`, {
    headers: { authorization: `Bearer ${credential}` },
    signal: controller.signal
  });
  if (!response.ok) throw new Error(`SSE 连接失败：${response.status}`);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const readMessage = async (): Promise<{ view: View | null }> => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('SSE 提前关闭');
      buffer += decoder.decode(chunk.value, { stream: true });
      const boundary = buffer.indexOf('\n\n');
      if (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const line = block.split('\n').find((item) => item.startsWith('data: '));
        if (line) return JSON.parse(line.slice(6)) as { view: View | null };
      }
    }
  };
  const first = await readMessage();
  if (first.view !== undefined) {
    // 初始帧到手，触发一个动作后再收一帧
    await api(`/api/tables/${code}/action`, {
      method: 'POST',
      body: JSON.stringify({ action: { type: 'deal' } })
    }, credential);
    const second = await readMessage();
    controller.abort();
    return second;
  }
  controller.abort();
  return first;
}

async function main(): Promise<void> {
  const identities: Credential[] = [];
  for (const name of ['冒烟甲', '冒烟乙', '冒烟丙']) {
    const payload = (await api('/api/auth/claim', {
      method: 'POST',
      body: JSON.stringify({ name: `${name}${Date.now() % 100000}` })
    })) as { credential: string; name: string };
    identities.push({ name: payload.name, credential: payload.credential });
  }
  console.log(`身份就绪：${identities.map((i) => i.name).join(' / ')}`);

  const created = (await api('/api/tables', { method: 'POST' }, identities[0]!.credential)) as { code: string };
  const code = created.code;
  for (let seat = 1; seat < 3; seat++) {
    await api(`/api/tables/${code}/join`, { method: 'POST' }, identities[seat]!.credential);
  }
  console.log(`同桌 ${code} 已三人入座`);

  const pushed = await checkSse(code, identities[0]!.credential);
  if (pushed === null || typeof pushed !== 'object' || !('view' in pushed)) {
    throw new Error('SSE 未推送视图');
  }
  console.log('SSE 推送正常');

  let scoredDeals = 0;
  let lastDealNo = 0;
  let guard = 0;

  while (guard++ < 20000) {
    const views = await Promise.all(identities.map((identity) => view(code, identity.credential)));
    const reference = views[0] ?? null;

    if (reference === null || reference.deal === null) {
      await api(`/api/tables/${code}/action`, {
        method: 'POST',
        body: JSON.stringify({ action: { type: 'deal' } })
      }, identities[0]!.credential);
      continue;
    }

    const deal = reference.deal;
    if (deal.phase === 'scored') {
      if (deal.dealNo > lastDealNo) {
        scoredDeals += 1;
        lastDealNo = deal.dealNo;
        console.log(
          `第 ${deal.dealNo} 副结算完成（合同 ${deal.contract?.points} ${deal.contract?.strain}，庄 ${deal.contract?.declarerSeat}）` +
            ` 级别：${reference.levels.map((l) => `${l.rank}(+${l.cycle})`).join(' / ')}`
        );
      }
      if (scoredDeals >= DEALS_TO_PLAY || reference.status === 'finished') break;
      await api(`/api/tables/${code}/action`, {
        method: 'POST',
        body: JSON.stringify({ action: { type: 'deal' } })
      }, identities[0]!.credential);
      continue;
    }

    if (deal.phase === 'auction') {
      const seat = deal.auctionTurn;
      const identity = identities[seat]!;
      const seatDeal = views[seat]?.deal ?? deal;
      const call = seatDeal.highestBid === null ? { points: 40, strain: 'C' as const } : 'pass';
      const error = await tryAction(code, identity.credential, { type: 'bid', call });
      if (error !== null) throw new Error(`叫牌被拒：${error}`);
      continue;
    }

    if (deal.phase === 'bury') {
      const declarerSeat = deal.contract!.declarerSeat;
      const declarerView = await view(code, identities[declarerSeat]!.credential);
      const cards = declarerView.you.hand.slice(0, 3);
      const error = await tryAction(code, identities[declarerSeat]!.credential, { type: 'bury', cards });
      if (error !== null) throw new Error(`埋底被拒：${error}`);
      continue;
    }

    const seat = deal.playTurn!;
    await playOneLegalMove(code, identities[seat]!.credential, seat);
  }

  const final = await view(code, identities[0]!.credential);
  if (final === null) throw new Error('结束时拿不到视图');
  writeFileSync(
    process.env['SMOKE_OUT'] ?? 'data/smoke-run.json',
    JSON.stringify({ code, identities, dealNo: final.dealNo, history: final.levels }, null, 2),
    'utf8'
  );
  console.log(
    `冒烟完成：完成 ${scoredDeals} 副，状态 ${final.status}，轮次请求 ${requests}（被拒 ${rejects}）`
  );
  if (scoredDeals < DEALS_TO_PLAY && final.status !== 'finished') {
    throw new Error('未在预期步数内完成指定副数');
  }
  console.log('SMOKE OK');
}

main().catch((error: unknown) => {
  console.error('SMOKE FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
