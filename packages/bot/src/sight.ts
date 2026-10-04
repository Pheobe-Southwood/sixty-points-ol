/**
 * 记牌与拆链：策略唯一允许使用的「额外信息」都从**公共视图**里数出来。
 *
 * 这一层存在的意义与 ADR-0010 的 stdio 传输同构：机器人只拿得到个人视图，
 * 于是「看不到别人的手牌与底牌」不是纪律问题，是它**没有别的路**。
 * 底牌 3 张对机器人永远未知（计入「未见的威胁」，宁保守不冒进）。
 */
import {
  cardClass,
  cardLevel,
  containsCard,
  SUITS,
  type Card,
  type CardClass,
  type TrumpModel
} from '@sixty/engine';

/** 某一时刻「我已经见过的牌」：自己手牌 + 已完成的墩 + 当前墩已出的牌 */
export class Sight {
  readonly #seen: readonly Card[];

  constructor(
    hand: readonly Card[],
    trickHistory: readonly { readonly plays: readonly { readonly cards: readonly Card[] }[] }[],
    current: readonly Card[]
  ) {
    this.#seen = [...hand, ...trickHistory.flatMap((t) => t.plays.flatMap((p) => p.cards)), ...current];
  }

  /** 这张牌是否已被我看到过（含在我手里） */
  seen(card: Card): boolean {
    return this.#seen.some((c) => sameCard(c, card));
  }

  /**
   * `card` 在它那一门里是不是「计牌必赢」：所有比它大的同门牌都已现身。
   *
   * 只数同门 —— 别家缺门杀牌的风险不在此列（那是打牌博弈，不是记牌事实）。
   */
  sureWinner(card: Card, t: TrumpModel): boolean {
    const cls = cardClass(card, t);
    const mine = cardLevel(card, t);
    for (const other of classCards(cls, t)) {
      if (cardLevel(other, t) > mine && !this.seen(other)) return false;
    }
    return true;
  }

  /** 一段顺子的「计牌必赢」：顶张之上已无敌（段内每张都属同一门的连续层号） */
  sureRun(cards: readonly Card[], t: TrumpModel): boolean {
    if (cards.length === 0) return false;
    return this.sureWinner(cards.reduce((top, c) => (cardLevel(c, t) > cardLevel(top, t) ? c : top)), t);
  }
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

function sameCard(a: Card, b: Card): boolean {
  return containsCard([a], b);
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
