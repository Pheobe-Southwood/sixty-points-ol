/**
 * 手机端右侧活页签抽屉的**唯一一份页签清单**。
 *
 * 页签条（`TabRail`）与抽屉（`TableDrawer`）都读这里，于是「有哪几页、什么顺序」只有一处
 * 真相 —— 顺序固定、不随阶段增减，标签位置才稳定（见 CONTEXT.md 的 Flagged ambiguities）。
 *
 * 四页的语义边界：抽屉只承载**查阅/次要**面；叫牌候选、确认埋底、出牌、结算弹窗都不进来，
 * 它们留在桌面上（动作面放在修一次要两步的地方是错的）。
 */
export interface DrawerTab {
  readonly key: DrawerTabKey;
  readonly label: string;
}

export type DrawerTabKey = 'report' | 'auction' | 'kitty' | 'me';

/** 从上到下的顺序就是右边缘页签条的排列顺序 */
export const DRAWER_TABS: readonly DrawerTab[] = [
  { key: 'report', label: '战报' },
  { key: 'auction', label: '叫牌' },
  { key: 'kitty', label: '底牌' },
  { key: 'me', label: '我' }
];

export function drawerTabLabel(key: DrawerTabKey): string {
  return DRAWER_TABS.find((tab) => tab.key === key)?.label ?? '';
}
