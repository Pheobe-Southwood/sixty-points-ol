/**
 * 演示页要用的牌局故事数据（生成物的形状）。
 *
 * 三条设计约束：
 * 1. **牌面存成牌键**（`'H5'` / `'j1'`）而不是引擎对象：生成物因此是纯 JSON 形状，
 *    脚本用 `JSON.stringify` 就能写出可 diff、可手查的文件，渲染时再用 `handFromKeys` 还原。
 * 2. **事实是烘焙好的**（`headline` / `tags` / 赢家 / 墩分）：页面渲染不再跑回放、不碰随机数，
 *    所以已发布的讲解不会因为将来引擎或 RNG 变化而变味。测试负责把「烘焙值」与「现场重算」对一遍。
 * 3. **每句话都带来源**：作者原话 / 润色 / 补写，页面与 review 清单都靠它。
 */
import type { Contract, DealSummary, Level, Seat, TrumpModel } from '@sixty/engine';

/** 一句话的来源：作者原话、润色（意思不动、只改字）、补写（原本没写） */
export type StorySource = 'author' | 'polish' | 'fill';

export type StoryStepKind = 'deal' | 'bid' | 'bury' | 'play';

/** 一个动作 + 它的说明与来源 */
export interface StoryLine {
  readonly index: number;
  readonly kind: StoryStepKind;
  readonly seat: Seat | null;
  /** 这一手是什么（引擎口径：谁、出了什么、赢没赢、多少分） */
  readonly headline: string;
  readonly tags: readonly string[];
  readonly cards: readonly string[];
  readonly points: number;
  /** 展示用的话；`null` = 这一步没有说明（只可能是「不叫」这类机械步） */
  readonly text: string | null;
  readonly source: StorySource | null;
  /** 润色/改写前的原话（`polish` 与 `clarify` 才有） */
  readonly original: string | null;
  /** 为什么这么改（润色时给作者复核用） */
  readonly why: string | null;
}

/** 一墩：三家各一手 + 赢家 + 墩分 + 墩级小结 */
export interface StoryTrick {
  readonly ordinal: number;
  readonly leaderSeat: Seat;
  readonly winnerSeat: Seat;
  readonly points: number;
  readonly size: number;
  readonly plays: readonly { readonly seat: Seat; readonly cards: readonly string[] }[];
  readonly headline: string;
  readonly tags: readonly string[];
  readonly note: string | null;
  /** 这一墩里每一步的说明（按出牌顺序），页面按「左边牌、右边话」排 */
  readonly lines: readonly StoryLine[];
}

export interface StoryDealSnapshot {
  /** 发牌时三家各 17 张（不是打完之后的空手牌） */
  readonly hands: readonly (readonly string[])[];
  readonly originalKitty: readonly string[];
  /** 庄家埋回去的 3 张 */
  readonly kitty: readonly string[];
  readonly trump: TrumpModel | null;
  readonly contract: Contract | null;
  readonly summary: DealSummary | null;
}

export interface StorySpecData {
  readonly seed: string;
  readonly dealerSeat: Seat;
  readonly levels: readonly Level[];
}

export interface StoryCounts {
  readonly total: number;
  readonly author: number;
  readonly polish: number;
  readonly fill: number;
  /** 没有说明的步数（应当只剩「不叫」这类） */
  readonly blank: number;
  readonly blankIndexes: readonly number[];
}

export interface StoryDealData {
  readonly slug: string;
  readonly title: string;
  readonly names: readonly [string, string, string];
  /** 只用于溯源与展示（「种子 gkz5mo」），渲染不依赖它重算牌面 */
  readonly spec: StorySpecData;
  readonly intro: string;
  readonly outro: string;
  readonly deal: StoryDealSnapshot;
  readonly lines: readonly StoryLine[];
  readonly tricks: readonly StoryTrick[];
  readonly counts: StoryCounts;
}

export function countSources(lines: readonly StoryLine[]): StoryCounts {
  const blankIndexes = lines.filter((line) => line.text === null).map((line) => line.index);
  return {
    total: lines.length,
    author: lines.filter((line) => line.source === 'author').length,
    polish: lines.filter((line) => line.source === 'polish').length,
    fill: lines.filter((line) => line.source === 'fill').length,
    blank: blankIndexes.length,
    blankIndexes
  };
}

/** 页面上给「已润色/补写」的条目用的短标签 */
export const SOURCE_LABEL: Record<StorySource, string> = {
  author: '原话',
  polish: '已润色',
  fill: '补写'
};
