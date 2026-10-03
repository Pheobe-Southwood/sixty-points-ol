/**
 * 工具面的**紧凑编码**：牌与叫品在线上是短字符串，不再是 `{suit,rank}` 对象。
 *
 * 为什么值得多这一层：一副牌要投喂给模型十几万字，而牌史占了其中八成，其中单张牌
 * `{"suit":"S","rank":14}` 是 22 个字符、`"S14"` 是 5 个 —— 换编码不改信息量，只改体积。
 *
 * 两条纪律：
 *   - 引擎类型一个都不动（`Card` / `BidCall` 仍是唯一契约），这里只做**字符串 ↔ 引擎类型**的翻译；
 *   - 出参与入参同形：`get_state` 给的 `"S14"` 可以原样喂回 `play`/`bury`。所以 `decodeCard`
 *     必须严格（认不出来的字符串当场报错，而不是猜一张牌出来）。
 *
 * 只编码、不解码叫品：`bid` 的入参仍是 `{points, strain}` 对象（一次只写一个，省不下体积，
 * 而显式形状少一类笔误），紧凑叫品只出现在**出参**里。
 */
import { isJoker, type BidCall, type Card, type Suit } from '@sixty/engine';

const LETTER_RANK: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14, T: 10 };

/**
 * 引擎牌 → 紧凑码：`♠A` = `"S14"`、`♠10` = `"S10"`、`♣5` = `"C5"`、小王 = `"j0"`、大王 = `"j1"`。
 *
 * 等级一律用引擎的数字（2..14），不混用 A/K/Q/J —— 一条规则比每条规则都短一个字符重要：
 * 模型要拿它跟 `rank` 比较大小，也要跟 `trump.rank` 比对，同一个数字空间少一类错。
 */
export function encodeCard(card: Card): string {
  if (isJoker(card)) return card.joker === 'small' ? 'j0' : 'j1';
  return `${card.suit}${card.rank}`;
}

/**
 * 紧凑码 → 引擎牌；认不出来返回 null。
 *
 * 宽容的地方只在**大小写**与 **10 写成 T**（两者都没有歧义，而一次参数错要白跑一个回合）；
 * 等级只在 2..14、花色只在 C/D/H/S，别的一律 null。
 */
export function decodeCard(code: string): Card | null {
  const raw = code.trim();
  const lower = raw.toLowerCase();
  if (lower === 'j0') return { joker: 'small' };
  if (lower === 'j1') return { joker: 'big' };

  const matched = /^([cdhs])([2-9]|1[0-4]|[tjqka])$/i.exec(raw);
  if (matched === null) return null;
  const suit = matched[1]!.toUpperCase() as Suit;
  const rankText = matched[2]!.toUpperCase();
  return { suit, rank: LETTER_RANK[rankText] ?? Number.parseInt(rankText, 10) };
}

export function decodeCards(codes: readonly string[]): Card[] | null {
  const cards: Card[] = [];
  for (const code of codes) {
    const card = decodeCard(code);
    if (card === null) return null;
    cards.push(card);
  }
  return cards;
}

/** 引擎叫品 → 紧凑码：`pass` / `"40C"` / `"45NT"` */
export function encodeCall(call: BidCall): string {
  return call === 'pass' ? 'pass' : `${call.points}${call.strain}`;
}

/** 一次出牌：座位号 + 牌码数组 */
export function encodeCards(cards: readonly Card[]): string[] {
  return cards.map(encodeCard);
}
