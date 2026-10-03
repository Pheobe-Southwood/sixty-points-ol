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

/** 手牌里与 `cls` 同门的那些牌 */
export function holdingOf(hand: readonly Card[], t: TrumpModel, cls: CardClass): Card[] {
  return hand.filter((c) => cardClass(c, t) === cls);
}

/**
 * 跟牌的两种模式，**只由「该门够不够」决定**：
 * 够 → 必须全出该门（还受结构优先约束）；不够 → 必须出完该门，其余任意垫。
 *
 * 这是 `validateFollow` 与 `playHint` 共用的那一个判断 —— 阈值只有一处，
 * 否则「工具面说该怎么出、服务端说非法」迟早会漂移。
 */
export type FollowMode = 'must-follow-class' | 'must-empty-class';

export function followMode(holdingCount: number, leadSize: number): FollowMode {
  return holdingCount >= leadSize ? 'must-follow-class' : 'must-empty-class';
}

/**
 * 「现在该怎么出」的结构化摘要（`check_play` 的省钱版）：
 * 只给**约束**，不复述手牌 —— 模型自己手上有 `you.hand`。
 *
 * `lead` 为 null 表示你是领出（单张，或同门顺子）；`holdingCount` 是你在领出那一门里的张数。
 */
export interface PlayHint {
  readonly lead: { readonly cardClass: CardClass; readonly size: number } | null;
  readonly holdingCount: number;
  readonly rule: FollowMode | 'lead-run-or-single';
}

export function playHint(hand: readonly Card[], t: TrumpModel, lead: readonly Card[] | null): PlayHint {
  const info = lead === null || lead.length === 0 ? null : leadInfo(lead, t);
  if (info === null) return { lead: null, holdingCount: hand.length, rule: 'lead-run-or-single' };
  const holding = holdingOf(hand, t, info.cardClass);
  return {
    lead: { cardClass: info.cardClass, size: info.size },
    holdingCount: holding.length,
    rule: followMode(holding.length, info.size)
  };
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

  const holding = holdingOf(hand, t, lead.cardClass);
  if (followMode(holding.length, n) === 'must-follow-class') {
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
