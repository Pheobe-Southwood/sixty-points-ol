/**
 * 「这一刻三家手里还有什么」——牌局章的叫牌屏与出牌屏都要显示它。
 *
 * 三条约束：
 * 1. **纯函数、只读烘焙好的生成物**：渲染时不跑回放、不碰随机数（与 ADR-0010 同一条规矩）；
 * 2. **牌用牌键**（`H5` / `j1`），与 `StoryDealSnapshot.hands` 同一口径，减法只在键上做；
 * 3. **张数可核对**：三家手牌 + 已经打出去的牌 + 底牌那 3 张 = 54，且任意时刻不重不漏
 *    （见 `apps/web/test/position.test.ts`）。
 */
import { cardClass, type Seat, type TrumpModel } from '@sixty/engine';
import type { StoryDealData } from '$lib/story/story-data';
// 相对路径 + `.ts`：这个模块要被 `node --test` 直接跑（那条路认不得 `$lib` 别名），
// 与 `story/convert.ts`、`story/replay.ts` 的做法一致。
import { handFromKeys } from '../story/replay.ts';

/** 三家当前手牌（牌键），下标即座位号 */
export type SeatHands = readonly [readonly string[], readonly string[], readonly string[]];

const SEATS: readonly Seat[] = [0, 1, 2];

/**
 * 发牌后、埋底前的三家手牌（各 17 张）。
 *
 * 叫牌全程都停在这个状态：谁也没出牌，庄家也还没拿底牌。
 */
export function dealtHands(story: StoryDealData): SeatHands {
  const [a, b, c] = story.deal.hands;
  return [[...a!], [...b!], [...c!]];
}

/**
 * 第一墩开打前的三家手牌。
 *
 * 庄家多一步，必须显式算，否则他的余牌会凭空多三张或少三张：
 * 拿上来的底牌并进手牌（17 → 20），再扣掉埋回去的那 3 张（→ 17）。
 */
export function playHands(story: StoryDealData): SeatHands {
  const hands: string[][] = dealtHands(story).map((hand) => [...hand]);
  const declarer = story.deal.contract?.declarerSeat ?? null;
  if (declarer !== null) {
    const buried = new Set(story.deal.kitty);
    hands[declarer] = [...hands[declarer]!, ...story.deal.originalKitty].filter((key) => !buried.has(key));
  }
  return [hands[0]!, hands[1]!, hands[2]!];
}

/** 某一墩开打前，已经落在桌面上的所有牌（只算更早的墩）；返回可变集合，调用方要往里加这一墩 */
function playedBefore(story: StoryDealData, ordinal: number | null): Set<string> {
  const played = new Set<string>();
  for (const trick of story.tricks) {
    if (ordinal !== null && trick.ordinal >= ordinal) continue;
    for (const play of trick.plays) for (const key of play.cards) played.add(key);
  }
  return played;
}

/** 从整副牌里减掉已经出手的牌 */
function without(cards: readonly string[], gone: ReadonlySet<string>): string[] {
  return cards.filter((key) => !gone.has(key));
}

/** 第 `ordinal` 墩**开打前**，三家各剩什么（讲解里「这时他手里只有…」说的就是它） */
export function handsBeforeTrick(story: StoryDealData, ordinal: number): SeatHands {
  const gone = playedBefore(story, ordinal);
  const base = playHands(story);
  return [without(base[0], gone), without(base[1], gone), without(base[2], gone)];
}

/**
 * 第 `ordinal` 墩**打完之后**，三家各剩什么——牌局章每一墩屏显示的就是它。
 *
 * 用「打完的」而不是「开打前的」有两个好处：与「当前」这个词一致；出牌区里那几张牌
 * 正好从横条里飞出去（同一张牌在两个区域配对，见 `motion.ts`），不用额外画一遍。
 */
export function handsAfterTrick(story: StoryDealData, ordinal: number): SeatHands {
  const gone = playedBefore(story, ordinal);
  const trick = story.tricks.find((item) => item.ordinal === ordinal);
  if (trick !== undefined) for (const play of trick.plays) for (const key of play.cards) gone.add(key);
  const base = playHands(story);
  return [without(base[0], gone), without(base[1], gone), without(base[2], gone)];
}

/** 这一手里有几张主牌（横条上「主 N 张」那个 N）；没有将牌信息时算 0 */
export function trumpInHand(keys: readonly string[], trump: TrumpModel | null): number {
  if (trump === null) return 0;
  return handFromKeys(keys).filter((card) => cardClass(card, trump) === 'T').length;
}
