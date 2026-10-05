/**
 * 记牌与拆链：策略唯一允许使用的「额外信息」都从**个人视图**里数出来。
 *
 * 这一层存在的意义与 ADR-0010 的 stdio 传输同构：机器人只拿得到个人视图，
 * 于是「看不到别人的手牌」不是纪律问题，是它**没有别的路**。
 *
 * 底牌（3 张）分两种情况，别写混（ADR-0015 修订过这里）：
 * - **闲家**（`buriedKitty` 为 null）：底牌完全未知，算作「未见的威胁」，宁保守不冒进；
 * - **庄家**：那是他自己埋下去的 3 张，`buriedKitty` 给了他 —— 它们**不可能再出现在牌桌上**，
 *   所以既不是威胁，也不该被当成「外面还有大牌」。
 *
 * 术语上把后者叫 **out of play（已出局）**，与「见过」（played / 我手里）区分开，
 * 但两者对「这张牌还能不能压我」是同一个意思，所以合并成一个集合 `#gone`。
 */
import {
  cardClass,
  cardLevel,
  classOfSet,
  containsCard,
  SUITS,
  type Card,
  type CardClass,
  type Seat,
  type TrumpModel
} from '@sixty/engine';

/** 一墩的形态（`trickHistory` 的元素与**当前这一墩**同形，所以能拼在一起喂进来） */
export interface TrickLike {
  readonly plays: readonly { readonly seat: Seat; readonly cards: readonly Card[] }[];
}

export interface SightInput {
  readonly hand: readonly Card[];
  /** 已完成的墩 + 当前这一墩（有牌才传；没开打的墩没有揭示任何信息） */
  readonly tricks: readonly TrickLike[];
  /** 庄家**自己埋掉的** 3 张（闲家传空数组）：它们已出局 */
  readonly outOfPlay?: readonly Card[];
  readonly trump: TrumpModel;
}

export class Sight {
  /** 我确知「不可能再压到我」的牌：我手里的 + 已打出的 + 庄家自己埋掉的 */
  readonly #gone: readonly Card[];
  /** 门类 → 已证缺门的座位（永久事实：缺门不会自己长回来） */
  readonly #voids: ReadonlyMap<CardClass, ReadonlySet<Seat>>;

  constructor(input: SightInput) {
    this.#gone = [
      ...input.hand,
      ...input.tricks.flatMap((trick) => trick.plays.flatMap((play) => play.cards)),
      ...(input.outOfPlay ?? [])
    ];
    this.#voids = inferVoids(input.tricks, input.trump);
  }

  /** 这张牌还能不能再出现（我手里 / 已打出 / 已埋进底里 —— 三种都不算威胁） */
  gone(card: Card): boolean {
    return this.#gone.some((c) => containsCard([c], card));
  }

  /**
   * `card` 在它那一门里是不是「同门已无敌」：所有比它大的同门牌要么我见过、要么已出局。
   *
   * **只数同门** —— 别家缺门杀牌是另一件事，用 `noRuffRisk` 单独判，
   * 别把这两条混成一个「必胜」（混过一次：末轮全押就栽在这里）。
   */
  sureWinner(card: Card, t: TrumpModel): boolean {
    const cls = cardClass(card, t);
    const mine = cardLevel(card, t);
    for (const other of classCards(cls, t)) {
      if (cardLevel(other, t) > mine && !this.gone(other)) return false;
    }
    return true;
  }

  /** 一段顺子的「同门已无敌」：顶张之上同门无活牌 */
  sureRun(cards: readonly Card[], t: TrumpModel): boolean {
    if (cards.length === 0) return false;
    return this.sureWinner(
      cards.reduce((top, c) => (cardLevel(c, t) > cardLevel(top, t) ? c : top)),
      t
    );
  }

  /** 某一门里还有多少张**没现身**的牌（对手手里 + 未知底牌里） */
  unseen(cls: CardClass, t: TrumpModel): number {
    return classCards(cls, t).filter((c) => !this.gone(c)).length;
  }

  /** 已证缺门的座位：他们在某一墩里对这门**一张都没出**，而当时手里有几张就必须出几张 */
  voidSeats(cls: CardClass): ReadonlySet<Seat> {
    return this.#voids.get(cls) ?? EMPTY_SEATS;
  }

  /**
   * 领出这门时「被缺门对手杀牌」的风险是否已被排除。
   *
   * 两段判据，**性质不同，注释里必须分开写**：
   * 1. **确定**：没有任何座位已被证明缺这门 —— 缺门是永久事实，证过就不会翻案；
   * 2. **启发式**：这门未见牌还够多（`minUnseen` = 策略给的余量：历史值闲家 5、庄家 2），
   *    说明两张手牌里多半各有几张。计数**证明不了**「没人缺门」：未见的 C 牌可以全在某一个
   *    对手手里，另一个正好缺门。
   *
   * 所以返回 true 只代表「值得当作安全领出」，不代表数学保证 —— 主牌门才可能真保证。
   * 余量不进这里写死，而是由 `BotParams.leadCaution` 传进来（领出积极性是实验要调的东西）。
   */
  noRuffRisk(cls: CardClass, t: TrumpModel, minUnseen: number): boolean {
    if (this.voidSeats(cls).size > 0) return false;
    // 闲家：底牌 3 张未知，所以要多留出 3 张的余量才算「两张手牌都可能有」
    return this.unseen(cls, t) >= minUnseen;
  }
}

const EMPTY_SEATS: ReadonlySet<Seat> = new Set<Seat>();

/**
 * 从墩史推「已证缺门」：引擎在「该门张数 < 领出张数」时要求把该门**全部**出完，
 * 所以某人在某门领出的那一墩里**一张该门牌都没出**，就等于当场证明他这门缺门。
 */
function inferVoids(tricks: readonly TrickLike[], t: TrumpModel): Map<CardClass, Set<Seat>> {
  const map = new Map<CardClass, Set<Seat>>();
  for (const trick of tricks) {
    if (trick.plays.length === 0) continue;
    const cls = classOfSet(trick.plays[0]!.cards, t);
    if (cls === null) continue;
    for (const play of trick.plays) {
      if (play.cards.some((card) => cardClass(card, t) === cls)) continue;
      const set = map.get(cls) ?? new Set<Seat>();
      set.add(play.seat);
      map.set(cls, set);
    }
  }
  return map;
}

/** 某一门的整副牌面（不含任何人手牌信息，只是牌表）：主牌门 18 张（NT 6 张），副牌门 12 张 */
export function classCards(cls: CardClass, t: TrumpModel): Card[] {
  const out: Card[] = [{ joker: 'small' }, { joker: 'big' }];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank += 1) {
      const c: Card = { suit, rank };
      if (cardClass(c, t) === cls) out.push(c);
    }
  }
  // 双王永远属于主牌门；副牌门不会收到它们
  return cls === 'T' ? out : out.slice(2);
}

/**
 * 一手同门牌拆成连续链（每链层号严格 +1），按链长降序、同长按最小层号升序 —— 全确定性。
 *
 * 与引擎 `segments` 的分解同构（每次抽最长连续链），只是保留具体牌，
 * 供策略在「结构优先」的约束内选顶窗/底窗。
 */
export function extractChains(cards: readonly Card[], t: TrumpModel): Card[][] {
  const byLevel = new Map<number, Card[]>();
  for (const card of cards) {
    const lv = cardLevel(card, t);
    const bucket = byLevel.get(lv);
    if (bucket) bucket.push(card);
    else byLevel.set(lv, [card]);
  }
  const chains: Card[][] = [];
  let remaining = cards.length;
  while (remaining > 0) {
    const levels = [...byLevel.entries()]
      .filter(([, bucket]) => bucket.length > 0)
      .map(([lv]) => lv)
      .sort((a, b) => a - b);
    let bestStart = 0;
    let bestLen = 0;
    let i = 0;
    while (i < levels.length) {
      let j = i;
      while (j + 1 < levels.length && levels[j + 1] === levels[j]! + 1) j += 1;
      const len = j - i + 1;
      if (len > bestLen) {
        bestLen = len;
        bestStart = i;
      }
      i = j + 1;
    }
    const chain: Card[] = [];
    for (let k = bestStart; k < bestStart + bestLen; k++) {
      chain.push(byLevel.get(levels[k]!)!.shift()!);
    }
    chains.push(chain);
    remaining -= bestLen;
  }
  return chains.sort((a, b) => b.length - a.length || cardLevel(a[0]!, t) - cardLevel(b[0]!, t));
}
