/**
 * 基线启发式策略：纯函数，输入只有引擎的**个人视图**（公共信息 + 自己的手牌与底牌）。
 *
 * 三条铁律（ADR-0014）：
 * 1. **确定性** —— 同一视图永远给出同一动作，表驱动测试与整局回放因此可行；不注入 RNG。
 * 2. **合法即构造** —— 输出永远来自引擎给出的合法集/结构（`bidOptions`、`bestProfile`、
 *   `checkPlay`），并逐次用 `checkPlay` 自检；服务端仍是唯一裁判。
 * 3. **只见个人视图** —— 记牌（`sight.ts`）只从公共墩史与自己手牌数出来，别人的手牌与
 *   底牌结构上拿不到。
 *
 * 档位是「基线规则式」：遵守领域结论「叫分只当及格线」（CONTEXT.md 升级表）——
 * 正常不跳叫，竞叫只在最小合法步长上抬；埋底不埋分；打牌不犯低级错（有分必收、
 * 末轮有保底/抠底意识）。难度梯度留待将来，不做。
 */
import {
  bestProfile,
  cardClass,
  cardLevel,
  cardPoints,
  cardsPoints,
  checkPlay,
  followMode,
  isJoker,
  leadInfo,
  MIN_BID,
  sortHand,
  STRAIN_RANK,
  STRAINS,
  SUITS,
  trickWinner,
  validateCall,
  type Bid,
  type BidCall,
  type Card,
  type PlayerSeat,
  type PublicView,
  type Seat,
  type Strain,
  type TrumpModel
} from '@sixty/engine';
import { classCards, extractChains, Sight } from './sight.ts';

/** 驱动器要发的动作（座位号由服务端按身份推导，见 ADR-0002） */
export type BotMove =
  | { readonly type: 'bid'; readonly call: BidCall }
  | { readonly type: 'bury'; readonly cards: readonly Card[] }
  | { readonly type: 'play'; readonly cards: readonly Card[] };

/**
 * 当前这一步该做什么：轮不到机器人（或没牌局）返回 null。
 * 驱动器在**每次状态变更后**调它；机器人从不发起 `deal` / `newGame` ——
 * 桌面级动作留给人类，这也是「一桌至少留一个人类座位」的原因。
 */
export function moveFor(view: PublicView | null, you: PlayerSeat | null): BotMove | null {
  if (view === null || you === null || view.status === 'finished') return null;
  const deal = view.deal;
  if (deal === null) return null;
  if (deal.phase === 'auction' && deal.auctionTurn === you.seat) {
    return { type: 'bid', call: bidFor(view, you) };
  }
  if (deal.phase === 'bury' && you.isDeclarer && deal.trump !== null) {
    return { type: 'bury', cards: buryFor(you.hand, deal.trump) };
  }
  if (deal.phase === 'play' && deal.playTurn === you.seat && deal.trump !== null) {
    return { type: 'play', cards: playFor(view, you, deal.trump) };
  }
  return null;
}

/**
 * 保底动作：**恒合法**的最低限度选择，供驱动器在策略动作被服务端拒绝时兜底
 * （策略与引擎万一漂移，桌面也绝不卡在机器人手里）。
 *
 * 与 `moveFor` 的区别只在「不挑好的，只挑一定合法的」：叫牌 pass、埋底交出手牌前三张、
 * 出牌走 `fallbackPlay`。轮不到它时同样返回 null。
 */
export function fallbackFor(view: PublicView | null, you: PlayerSeat | null): BotMove | null {
  if (view === null || you === null || view.status === 'finished') return null;
  const deal = view.deal;
  if (deal === null) return null;
  if (deal.phase === 'auction' && deal.auctionTurn === you.seat) return { type: 'bid', call: 'pass' };
  if (deal.phase === 'bury' && you.isDeclarer && you.hand.length >= 3) {
    return { type: 'bury', cards: you.hand.slice(0, 3) };
  }
  if (deal.phase === 'play' && deal.playTurn === you.seat && deal.trump !== null) {
    const trick = deal.trick;
    const lead = trick !== null && trick.plays.length > 0 ? trick.plays[0]!.cards : null;
    return {
      type: 'play',
      cards: fallbackPlay(you.hand, deal.trump, lead, lead?.length ?? 1)
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 叫牌
// ---------------------------------------------------------------------------

/** 手牌对某花色的牌力评估（整数，越大越强）；trumps 是该花色下的主牌张数 */
export interface StrainStrength {
  readonly strain: Strain;
  readonly value: number;
  readonly trumps: number;
}

/**
 * 牌力：主牌的长度与质量 + 副牌大牌 + 缺门。级牌点数取**自己的级别**
 * （我若成为庄家，级牌就是我的点数 —— 叫牌时唯一合理的近似）。
 */
export function strengthOf(hand: readonly Card[], rank: number, strain: Strain): StrainStrength {
  const t: TrumpModel = { strain, rank };
  const trumps = hand.filter((c) => cardClass(c, t) === 'T');
  let value = 0;
  for (const c of trumps) {
    if (isJoker(c)) value += c.joker === 'big' ? 4 : 3;
    else {
      const lv = cardLevel(c, t);
      if (lv >= 14) value += 3; // 主级
      else if (lv === 13) value += 2; // 副级
      else if (lv >= 11) value += 2; // 主花色 A
      else if (lv === 10) value += 1; // 主花色 K
    }
  }
  if (trumps.length >= 7) value += 2;
  if (trumps.length >= 9) value += 3;
  for (const suit of SUITS) {
    // 主花色整门都是主牌，不该再算一次副门（否则会白拿一个「缺门」加分）
    if (strain !== 'NT' && suit === strain) continue;
    const side = hand.filter((c) => !isJoker(c) && c.suit === suit && cardClass(c, t) !== 'T');
    if (side.length === 0) {
      value += 1; // 缺门：垫牌与杀牌的空间
      continue;
    }
    if (side.some((c) => !isJoker(c) && c.rank === 14)) value += 2;
    else if (side.some((c) => !isJoker(c) && c.rank === 13)) value += 1;
  }
  return { strain, value, trumps: trumps.length };
}

/** 牌力换算成「愿意叫到的分数」；不足 40 时返回 0（只 pass） */
export function willingPoints(value: number): number {
  if (value < 15) return 0;
  return Math.min(85, MIN_BID + Math.floor((value - 15) / 3) * 5);
}

/**
 * 叫牌决策：
 * - 没人叫过 → 够 40 就开叫 40（最佳花色），否则 pass；
 * - 已有最高叫品 → 若是我自己的，pass（不抬自己）；否则只在**最小合法加叫**
 *   不超过愿意分数时竞叫（同分换更高花色，或 +5）—— 跳叫买不到任何级数
 *   （CONTEXT.md 升级表），唯一理由是把庄家位从对手手里拿走，那也只需最小步长。
 */
export function bidFor(view: PublicView, you: PlayerSeat): BidCall {
  const rank = view.levels[you.seat]!.rank;
  const entries = view.deal?.auction ?? [];
  const highest = view.deal?.highestBid ?? null;

  let best: StrainStrength | null = null;
  for (const strain of STRAINS) {
    const s = strengthOf(you.hand, rank, strain);
    if (best === null || s.value > best.value || (s.value === best.value && s.trumps > best.trumps)) {
      best = s;
    }
  }
  const willing = willingPoints(best!.value);

  if (highest === null) {
    return willing >= MIN_BID ? { points: MIN_BID, strain: best!.strain } : 'pass';
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (entry.call !== 'pass') {
      if (entry.seat === you.seat) return 'pass'; // 最高叫品已是我的
      break;
    }
  }
  const nextPoints =
    STRAIN_RANK[best!.strain] > STRAIN_RANK[highest.strain] ? highest.points : highest.points + 5;
  const call: Bid = { points: nextPoints, strain: best!.strain };
  if (willing >= nextPoints && validateCall(call, highest) === null) return call;
  return 'pass';
}

// ---------------------------------------------------------------------------
// 埋底
// ---------------------------------------------------------------------------

/**
 * 埋底：埋掉 keep 值最小的 3 张 —— 先副牌后主牌、先低张后高张、先无分后有分。
 * 基线不埋分（埋分是保底/抠底的博弈点，留给更高档位），也不埋主牌 ——
 * 主牌既是赢墩手段也是护底资本。全是主牌的极端手牌才会被迫埋主。
 */
export function buryFor(hand: readonly Card[], t: TrumpModel): Card[] {
  const keep = (c: Card): number =>
    (cardClass(c, t) === 'T' ? 1000 : 0) + cardLevel(c, t) * 2 + cardPoints(c) * 50;
  const indexed = hand.map((c, i) => ({ c, i }));
  indexed.sort((a, b) => keep(a.c) - keep(b.c) || a.i - b.i);
  return indexed.slice(0, 3).map(({ c }) => c);
}

// ---------------------------------------------------------------------------
// 打牌
// ---------------------------------------------------------------------------

/** 一张牌「垫出去最不心疼」的程度：越小越先垫 —— 无分 > 有分，副牌 > 主牌，低张 > 高张 */
function discardValue(c: Card, t: TrumpModel): number {
  return (cardClass(c, t) === 'T' ? 100 : 0) + cardLevel(c, t) * 2 + cardPoints(c) * 30;
}

export function playFor(view: PublicView, you: PlayerSeat, t: TrumpModel): Card[] {
  const deal = view.deal!;
  const trick = deal.trick;
  const lead = trick !== null && trick.plays.length > 0 ? trick.plays[0]!.cards : null;
  const sight = new Sight(you.hand, deal.trickHistory, trick?.plays.flatMap((p) => p.cards) ?? []);
  return lead === null ? leadPlay(you, t, sight) : followPlay(view, you, t, lead);
}

/** 我若此刻出这些牌，是否赢下当前这一墩（引擎的 trickWinner 是唯一裁判） */
function wouldWin(
  plays: readonly { seat: Seat; cards: readonly Card[] }[],
  seat: Seat,
  mine: readonly Card[],
  t: TrumpModel
): boolean {
  return trickWinner([...plays.map((p) => ({ ...p })), { seat, cards: mine }], t) === seat;
}

// --- 领出 -------------------------------------------------------------------

function leadPlay(you: PlayerSeat, t: TrumpModel, sight: Sight): Card[] {
  const hand = you.hand;
  if (hand.length === 1) return [hand[0]!];

  const byClass = new Map<string, Card[]>();
  for (const c of sortHand(hand, t)) {
    const cls = cardClass(c, t);
    const bucket = byClass.get(cls);
    if (bucket) bucket.push(c);
    else byClass.set(cls, [c]);
  }
  const trumps = byClass.get('T') ?? [];
  const sideSuits = SUITS.map((s) => byClass.get(s) ?? []).filter((cards) => cards.length > 0);

  // 末轮：整手恰是一门单段顺子时这就是最后一墩（领出张数 = 手牌数）。
  // 计牌必赢才全押 —— 保底 x 倍与抠底 x 倍都在这一墩上，输了就是 x 倍的失误。
  // 判据必须用引擎的领出校验：`isRun` 只看层号连续、**不看门类**，
  // 混门的牌（如 ♥Q + ♠J + ♠10 在 ♠ 将时层号恰好相连）会被它误判成一顺。
  if (hand.length >= 2 && checkPlay(hand, hand, t, null) === null && sight.sureRun(hand, t)) {
    return [...hand];
  }

  // 顶主吊主：持计牌顶级主牌、且主牌还有未见身的（对手或底牌里），出顶主单张
  // 抽主 —— 庄家抽掉闲家的杀牌资本，闲家抽掉庄家的护底资本。
  if (trumps.length > 0) {
    const top = trumps.reduce((a, b) => (cardLevel(b, t) > cardLevel(a, t) ? b : a));
    if (sight.sureWinner(top, t)) {
      const total = classCards('T', t).length;
      const seen = classCards('T', t).filter((c) => sight.seen(c)).length;
      // 未现身的主牌（在对手手里或在底牌里）都值得抽
      if (total - seen > 0) return [top];
    }
  }

  // 计牌必赢的副牌顶段：先找最长的 sure 顶段（≥2 收大分），退而求其次 sure 单张。
  let sure: Card[] | null = null;
  for (const cards of sideSuits) {
    for (const chain of extractChains(cards, t)) {
      for (let len = Math.min(chain.length, 3); len >= 2; len--) {
        const window = chain.slice(chain.length - len);
        if (sight.sureRun(window, t) && (sure === null || window.length > sure.length)) sure = window;
      }
      const single = [chain[chain.length - 1]!];
      if (sight.sureWinner(single[0]!, t) && sure === null) sure = single;
    }
  }
  if (sure !== null) return sure;

  // 兜底：最短副门的最低张（省主牌、保大牌）。
  if (sideSuits.length > 0) {
    const shortest = sideSuits.reduce((a, b) => (b.length < a.length ? b : a));
    return [shortest.reduce((a, b) => (cardLevel(b, t) < cardLevel(a, t) ? b : a))];
  }
  // 只剩主牌：最低主牌。
  return [trumps.reduce((a, b) => (cardLevel(b, t) < cardLevel(a, t) ? b : a))];
}

// --- 跟牌 -------------------------------------------------------------------

function followPlay(
  view: PublicView,
  you: PlayerSeat,
  t: TrumpModel,
  lead: readonly Card[]
): Card[] {
  const deal = view.deal!;
  const hand = you.hand;
  const trick = deal.trick!;
  const info = leadInfo(lead, t)!;
  const n = info.size;
  const holding = hand.filter((c) => cardClass(c, t) === info.cardClass);
  const mode = followMode(holding.length, n);
  const trickPoints = cardsPoints(trick.plays.flatMap((p) => p.cards));
  const finalTrick = hand.length === n; // 这一墩打完手牌就空了（引擎保证三家同步）
  const contract = deal.contract;
  const declarerPoints = contract === null ? 0 : deal.captured[contract.declarerSeat]!.points;
  const wantWin =
    trickPoints >= 5 ||
    finalTrick ||
    (you.isDeclarer && contract !== null && declarerPoints + trickPoints < contract.points);

  const verify = (cards: Card[]): Card[] => {
    if (checkPlay(hand, cards, t, lead) === null) return cards;
    return fallbackPlay(hand, t, lead, n);
  };

  if (mode === 'must-follow-class') {
    const profile = bestProfile(holding, t, n);
    const win = buildFollow(holding, t, profile, 'top');
    const low = buildFollow(holding, t, profile, 'bottom');
    if (wantWin && wouldWin(trick.plays, you.seat, win, t)) return verify(win);
    return verify(low);
  }

  // 缺门（该门一张都没有）且领出不是主牌：找**顶张最低**且压得过当前赢家的主牌顺子杀牌。
  if (holding.length === 0 && info.cardClass !== 'T') {
    const trumps = hand.filter((c) => cardClass(c, t) === 'T');
    const candidates: Card[][] = [];
    for (const chain of extractChains(trumps, t)) {
      for (let start = 0; start + n <= chain.length; start++) candidates.push(chain.slice(start, start + n));
    }
    candidates.sort(
      (a, b) => cardLevel(a[a.length - 1]!, t) - cardLevel(b[b.length - 1]!, t) || a.length - b.length
    );
    if (wantWin) {
      for (const run of candidates) {
        if (wouldWin(trick.plays, you.seat, run, t)) return verify(run);
      }
    }
  }

  // 垫牌/贴牌：出完该门剩下的牌 + 最不心疼的 k 张
  const rest = [...hand].filter((c) => cardClass(c, t) !== info.cardClass);
  const sorted = rest.sort((a, b) => discardValue(a, t) - discardValue(b, t));
  return verify([...holding, ...sorted.slice(0, n - holding.length)]);
}

/**
 * 在「结构优先」的段长约束内挑具体牌。
 *
 * 段长来自引擎的 `bestProfile`（唯一实现），**链的挑选**才是我方的策略：
 * 想赢就从层号最高的链上取顶窗（手里最强的那一顺），想让利就从最低的链上取底窗。
 * 只按链长排序是不够的 —— 单张跟牌时「找第一条够长的链」会永远挑到最低那张，
 * 于是「该赢的墩不赢」（这正是单测抓到过的错）。
 */
function buildFollow(
  holding: readonly Card[],
  t: TrumpModel,
  pieces: readonly number[],
  window: 'top' | 'bottom'
): Card[] {
  const topOf = (chain: readonly Card[]): number => cardLevel(chain[chain.length - 1]!, t);
  const chains = extractChains(holding, t).map((chain) => [...chain]);
  chains.sort((a, b) =>
    window === 'top' ? topOf(b) - topOf(a) || b.length - a.length : topOf(a) - topOf(b) || b.length - a.length
  );
  const out: Card[] = [];
  let budget = pieces.reduce((sum, p) => sum + p, 0);
  for (const piece of pieces) {
    if (budget <= 0) break;
    const take = Math.min(piece, budget);
    let target = chains.find((chain) => chain.length >= take);
    if (target === undefined) target = chains.find((chain) => chain.length > 0);
    if (target === undefined) break;
    const count = Math.min(take, target.length);
    out.push(...(window === 'top' ? target.slice(target.length - count) : target.slice(0, count)));
    chains.splice(chains.indexOf(target), 1, target.slice(count));
    budget -= count;
  }
  return out;
}

/** 兜底出牌：策略构造失败（理论不该发生）时的合法保底，绝不让桌面卡在机器人手里 */
function fallbackPlay(hand: readonly Card[], t: TrumpModel, lead: readonly Card[] | null, n: number): Card[] {
  const ok = (cards: readonly Card[]): boolean => checkPlay(hand, cards, t, lead) === null;
  if (lead === null) return [sortHand(hand, t)[0]!];
  const info = leadInfo(lead, t)!;
  const holding = hand.filter((c) => cardClass(c, t) === info.cardClass);
  if (holding.length >= n) {
    for (const combo of combinations(holding, n)) {
      if (ok(combo)) return combo;
    }
  }
  const rest = hand
    .filter((c) => cardClass(c, t) !== info.cardClass)
    .sort((a, b) => discardValue(a, t) - discardValue(b, t));
  return [...holding, ...rest.slice(0, n - holding.length)];
}

function combinations(cards: readonly Card[], n: number): Card[][] {
  const out: Card[][] = [];
  const walk = (start: number, acc: Card[]): void => {
    if (acc.length === n) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < cards.length; i++) {
      acc.push(cards[i]!);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}
