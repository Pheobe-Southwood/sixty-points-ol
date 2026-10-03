import type { PlayerHand, Role } from './shared';
import type { PublicView } from '@sixty/engine';

/** 判断「选择是否还有意义」只需要这几项：完整负载结构上也满足它 */
export interface SelectionContext {
  readonly role: Role;
  readonly view: PublicView | null;
  readonly you: PlayerHand | null;
}

/**
 * 收到一帧负载后，是否要丢弃玩家**正在选的牌**。
 *
 * 只有「让选择失去意义」的变化才清空：
 * - 牌局推进了（`view.version` 变化）——上一墩/上一个叫品已落地，选中态不该留着；
 * - 角色或座位变了（我入座/离座/换了身份）——选择属于上一个座位。
 *
 * 名单与在线点的变化**不清空**：任何人连上或断开这条流都会让服务端广播一帧
 * （`stream/+server.ts` 注册后即 broadcast，断开时也 broadcast），
 * 若无条件清空，观战者反复连断就能把在座玩家的选牌刷掉 —— 观战开放后这条路径人人为之。
 */
export function shouldResetSelection(
  prev: SelectionContext | null,
  next: SelectionContext
): boolean {
  if (prev === null) return true;
  if (prev.view?.version !== next.view?.version) return true;
  if (prev.role !== next.role) return true;
  if ((prev.you?.seat ?? null) !== (next.you?.seat ?? null)) return true;
  return false;
}
