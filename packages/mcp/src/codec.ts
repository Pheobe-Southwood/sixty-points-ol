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
 * **叫品也走这条编码，是被宿主逼出来的**（原先只编码出参，`bid` 的入参是 `{points, strain}` 对象）：
 * 那个对象只能写成 `z.union`，而 MCP SDK 把 union 播报成 `anyOf` —— 宿主在把工具 schema 交给模型前
 * 会清洗它，Cuplivo 的清洗器原话是「把 anyOf/oneOf/allOf 拍平成第一个分支」，于是 `anyOf` 里排在
 * `"pass"` 后面的对象分支**整个消失**，模型被告知 `call` 只能是 `"pass"`：每次真叫牌都失败，只有
 * pass 成功（Google 系 API 同样不支持 anyOf/const）。改成扁平字符串后 schema 只剩 `{"type":"string"}`，
 * 任何宿主都压不坏，模型还能直接抄出参里的写法（`highestBid`、`auction[].call`）。
 */
import {
  BID_STEP,
  isJoker,
  MIN_BID,
  type BidCall,
  type Card,
  type Strain,
  type Suit
} from '@sixty/engine';

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

/**
 * 紧凑码 → 引擎叫品；认不出来返回 null。
 *
 * 宽容的地方只在**大小写**与**分数与花色之间的空格**（两者都没有歧义，而一次参数错要白跑一个回合）；
 * 形状按引擎的规则卡死：整数、不低于 `MIN_BID`、`BID_STEP` 的倍数，花色只在 C/D/H/S/NT。
 *
 * 「是否高于当前叫品」**不在这里判**：那要看局面，是服务端的裁决（`validateCall` 的另一半）。
 */
export function decodeCall(code: string): BidCall | null {
  const raw = code.trim();
  if (/^pass$/i.test(raw)) return 'pass';

  const matched = /^(\d{1,4})\s*(C|D|H|S|NT)$/i.exec(raw);
  if (matched === null) return null;
  const points = Number.parseInt(matched[1]!, 10);
  if (points < MIN_BID || points % BID_STEP !== 0) return null;
  return { points, strain: matched[2]!.toUpperCase() as Strain };
}

/** 一次出牌：座位号 + 牌码数组 */
export function encodeCards(cards: readonly Card[]): string[] {
  return cards.map(encodeCard);
}
