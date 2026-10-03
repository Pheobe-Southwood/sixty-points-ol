/**
 * 由 apps/web/scripts/build-deal-stories.ts 生成，请勿手改。
 *
 * 源文件：
 *   docs/deals/<slug>.json         作者打出来的牌局与逐步原话（永不改写）
 *   docs/deals/notes/<slug>.json   润色与补写（含 original / why，供复核）
 * 改讲解请改这两份，再重跑：pnpm --filter web deal
 */
import type { StoryDealData } from '$lib/story/story-data';
import { STORY as STORY_0 } from './245.ts';
import { STORY as STORY_1 } from './222.ts';
import { STORY as STORY_2 } from './deal-zhs7sx.ts';

/** 演示页里的牌局故事；顺序即页面上的顺序（先早局、后后期局） */
export const STORIES: readonly StoryDealData[] = [
  STORY_0,
  STORY_1,
  STORY_2
];
