/**
 * 牌局故事（Deal story）：作者在编排台里打出来、并逐步写说明的那一副牌。
 *
 * 两个形态：
 * - `StoryDraft`：编排台的草稿（多一个本机 id 与更新时间），存 localStorage；
 * - `DealStory`：导出给下游（我拿它做网页）的机器可读版本，带冗余牌面存证。
 *
 * 数据契约是这一整套东西的接口：编排台、转换脚本、演示页都只认这里定义的结构。
 */
import type { BidCall, Contract, DealSummary, Level, Seat, TrumpModel } from '@sixty/engine';

export const STORY_VERSION = 1;

/** 示例座位的默认代称（与 /rules 教程一致：本人用「你」，不出现方位称谓） */
export const DEFAULT_NAMES: readonly [string, string, string] = ['你', '阿豪', '小美'];

/** 种子↔牌局的对应关系：这三个值 + 仓库里的 RNG 实现 = 一副确定的牌 */
export interface StorySpec {
  readonly seed: string;
  readonly dealerSeat: Seat;
  readonly levels: readonly Level[];
}

/**
 * 一个动作。与引擎 `Action` 同形，但埋底/出牌用**牌键**（`'H5'` / `'j1'`），
 * 这样 JSON 是人能读、机器能查的，不依赖引擎的 Card 对象字面量。
 */
export type StoryAction =
  | { readonly type: 'deal' }
  | { readonly type: 'bid'; readonly seat: Seat; readonly call: BidCall }
  | { readonly type: 'bury'; readonly seat: Seat; readonly cards: readonly string[] }
  | { readonly type: 'play'; readonly seat: Seat; readonly cards: readonly string[] };

export type StoryActionType = StoryAction['type'];

/** 动作 + 作者说明（说明可空；空说明在界面上会被标记出来，提醒还没讲） */
export type StoryStep = StoryAction & { readonly note: string | null };

/**
 * 回放的入参：说明可有可无。
 *
 * 编排台里说明**不是回放的输入**（存在平行的 `notes` 里，敲字时不必重放整副牌），
 * 所以它传进来的是纯 `StoryAction`；导出的 JSON 里则每条都带 `note`。两者都能回放。
 */
export type StoryStepInput = StoryAction & { readonly note?: string | null };

/** 导出的冗余存证：不跑引擎也能读懂这副牌，且渲染一律读它，不重算 */
export interface StoryDealSnapshot {
  readonly hands: readonly (readonly string[])[];
  readonly originalKitty: readonly string[];
  readonly kitty: readonly string[];
  readonly trump: TrumpModel | null;
  readonly contract: Contract | null;
  readonly summary: DealSummary | null;
}

/** 编排台草稿（localStorage 里的形态） */
export interface StoryDraft {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly names: readonly [string, string, string];
  readonly spec: StorySpec;
  readonly actions: readonly StoryStep[];
  /** 与「已完成的墩」一一对应（0 起）；可以比墩数短，缺的就是没写 */
  readonly trickNotes: readonly (string | null)[];
  readonly intro: string;
  readonly outro: string;
  readonly updatedAt: string;
}

/** 导出给下游的形态 */
export interface DealStory {
  readonly version: number;
  readonly slug: string;
  readonly title: string;
  readonly names: readonly [string, string, string];
  readonly spec: StorySpec;
  readonly deal: StoryDealSnapshot;
  readonly actions: readonly StoryStep[];
  readonly trickNotes: readonly (string | null)[];
  readonly intro: string;
  readonly outro: string;
  /** 这副牌是否已经打完（没打完的导出只能当草稿备份，不能进演示页） */
  readonly complete: boolean;
  readonly exportedAt: string;
}

/** 新建草稿的入参（界面表单 → 草稿） */
export interface DraftSetup {
  readonly seed: string;
  readonly dealerSeat: Seat;
  readonly levels: readonly Level[];
  readonly names: readonly [string, string, string];
  readonly title: string;
  readonly slug: string;
}
