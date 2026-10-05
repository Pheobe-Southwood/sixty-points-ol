/**
 * 手机端右侧活页签抽屉的**唯一一份页签清单**。
 *
 * 页签条（`TabRail`）与抽屉（`TableDrawer`）都读这里，于是「有哪几页、什么顺序」只有一处
 * 真相 —— 顺序固定、不随阶段增减，标签位置才稳定（见 CONTEXT.md 的 Flagged ambiguities）。
 *
 * 四页的语义边界：抽屉只承载**查阅/次要**面；叫牌候选、确认埋底、出牌、结算弹窗都不进来，
 * 它们留在桌面上（动作面放在修一次要两步的地方是错的）。「牌桌」页给的是这张桌现在的样子
 * （三家座位 + 我的身份），页头右上角那枚桌况簇给的是**一步动作**（观战人数 / 离座 / 改名 / 入座）。
 */
export interface DrawerTab {
  readonly key: DrawerTabKey;
  readonly label: string;
}

export type DrawerTabKey = 'report' | 'auction' | 'kitty' | 'table';

/** 从上到下的顺序就是右边缘页签条的排列顺序 */
export const DRAWER_TABS: readonly DrawerTab[] = [
  { key: 'report', label: '战报' },
  { key: 'auction', label: '叫牌' },
  { key: 'kitty', label: '底牌' },
  { key: 'table', label: '牌桌' }
];

export function drawerTabLabel(key: DrawerTabKey): string {
  return DRAWER_TABS.find((tab) => tab.key === key)?.label ?? '';
}

/**
 * 「战报」页内的两种模式：**页内**分段切换，不是第五个页签。
 *
 * 升级表与逐副卡读的是同一份 `history`（升级表只是换一种铺法），把它做成页签会让右边缘多一格
 * 语义重复的入口；而四页签固定不随阶段增减是已记录的决定，页内模式不碰它。
 */
export type ReportMode = 'deals' | 'progress';

export const REPORT_MODES: readonly { readonly key: ReportMode; readonly label: string }[] = [
  { key: 'deals', label: '逐副' },
  { key: 'progress', label: '升级表' }
];
