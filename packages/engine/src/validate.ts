import { containsCard, removeCards, type Card } from './cards.ts';
import {
  bestProfile,
  cardClass,
  classOfSet,
  compareProfiles,
  isRun,
  segments,
  type CardClass,
  type TrumpModel
} from './order.ts';

export interface LeadInfo {
  readonly cardClass: CardClass;
  readonly cards: readonly Card[];
  readonly size: number;
}

export function leadInfo(cards: readonly Card[], t: TrumpModel): LeadInfo | null {
  const cls = classOfSet(cards, t);
  return cls === null ? null : { cardClass: cls, cards, size: cards.length };
}

/** 领出校验：非空、同门、多张必须是顺子（不允许甩牌） */
export function validateLead(hand: readonly Card[], cards: readonly Card[], t: TrumpModel): string | null {
  if (cards.length === 0) return '必须至少出一张牌';
  if (cards.length > hand.length) return '出牌数超过手牌数';
  if (removeCards(hand, cards) === null) return '手牌中没有这些牌';
  const cls = classOfSet(cards, t);
  if (cls === null) return '一次出的多张牌必须同门（不允许甩牌）';
  if (cards.length > 1 && !isRun(cards, t)) return '多张牌必须构成顺子';
  return null;
}

/**
 * 跟牌校验：
 * - 张数必须与领出一致
 * - 该门张数 ≥ n：必须全出该门 n 张，且连续段分解字典序最大（结构优先）
 * - 该门张数 < n：必须出完该门所有牌，其余任意（垫牌自由；不成结构则不能赢）
 */
export function validateFollow(
  hand: readonly Card[],
  cards: readonly Card[],
  lead: LeadInfo,
  t: TrumpModel
): string | null {
  const n = lead.size;
  if (cards.length !== n) return `必须出 ${n} 张牌`;
  if (removeCards(hand, cards) === null) return '手牌中没有这些牌';

  const holding = hand.filter((c) => cardClass(c, t) === lead.cardClass);
  if (holding.length >= n) {
    if (!cards.every((c) => cardClass(c, t) === lead.cardClass)) return '该门牌够，必须全部跟该门';
    if (compareProfiles(segments(cards, t), bestProfile(holding, t, n)) !== 0) {
      return '跟牌结构不足：应按最长顺子优先出牌';
    }
    return null;
  }

  const missing = holding.filter((h) => !containsCard(cards, h));
  if (missing.length > 0) return '该门牌不足，必须先出完该门所有牌';
  return null;
}

/**
 * 出牌的本地预判：`lead` 为 null 表示本轮还没人出牌（你是领出）。
 * 返回 null 表示合法，否则是给玩家看的中文原因。
 *
 * 界面（`$lib/labels` 的 checkPlay）与 MCP 工具面的 `check_play` 都走这一处 ——
 * 服务端始终是唯一裁判，这只是同一套规则的提前告知。
 */
export function checkPlay(
  hand: readonly Card[],
  cards: readonly Card[],
  t: TrumpModel,
  lead: readonly Card[] | null
): string | null {
  if (cards.length === 0) return null;
  if (lead === null) return validateLead(hand, cards, t);
  const info = leadInfo(lead, t);
  if (info === null) return '牌局状态异常';
  return validateFollow(hand, cards, info, t);
}
