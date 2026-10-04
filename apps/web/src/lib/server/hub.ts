/** 每张同桌一条 SSE 通道表（单实例内存态，见 ADR-0001） */
export interface Connection {
  readonly userId: number;
  /** 通知该连接重新读取并推送自己的个人视图 */
  readonly push: () => void;
}

const channels = new Map<number, Set<Connection>>();

export function register(tableId: number, connection: Connection): () => void {
  const set = channels.get(tableId) ?? new Set<Connection>();
  set.add(connection);
  channels.set(tableId, set);
  return () => {
    set.delete(connection);
    if (set.size === 0) channels.delete(tableId);
  };
}

/**
 * 待推送的桌（**工作列表**，不是递归）。
 *
 * 为什么需要它：推送会让每条连接**重新取一遍负载**（`payloadFor`），而取负载本身可能又触发一次
 * 「某人刚上线，该推一帧」（见 `touch`）。如果直接递归调用 `broadcast`，就变成
 * 「推送里再推送」，深度取决于连接数，还容易写成「推送中直接丢弃」—— 那会丢帧：
 * 同一轮里后触发的那个人的点在先算出的帧里仍然是灰的，而不会再有第二轮。
 *
 * 所以：推送期间来的触发排进队列，当前这一轮结束后继续排空。**不会自激** ——
 * 触发只有一个来源（某人自己的请求），而每个身份的「离线→在线」翻转在一个窗口内至多一次。
 */
const pending = new Set<number>();
let flushing = false;

export function broadcast(tableId: number): void {
  pending.add(tableId);
  if (flushing) return;
  flushing = true;
  try {
    while (pending.size > 0) {
      const next = pending.values().next().value as number;
      pending.delete(next);
      pushNow(next);
    }
  } finally {
    // 必须复位：一次推送里抛出异常会让后续所有广播静默失效，那比不推送更难查
    flushing = false;
  }
}

function pushNow(tableId: number): void {
  const set = channels.get(tableId);
  if (!set) return;
  for (const connection of [...set]) {
    try {
      connection.push();
    } catch {
      set.delete(connection);
    }
  }
}

/**
 * 该桌当前所有 SSE 连接的 userId。
 *
 * 观战连接与玩家连接在这里不作区分：**角色每帧由数据库现算**（`seatOf`），
 * 把角色缓存在连接上会在「观战者刚入座」这一帧读到过期值（观战人数、在线点都会滞后一整轮）。
 */
export function connectionUserIds(tableId: number): readonly number[] {
  const set = channels.get(tableId);
  return set ? [...set].map((c) => c.userId) : [];
}

export function isUserOnline(tableId: number, userId: number): boolean {
  const set = channels.get(tableId);
  if (!set) return false;
  for (const connection of set) if (connection.userId === userId) return true;
  return false;
}

/**
 * 「最近活跃」窗口：谁在最近这段时间里发过请求。
 *
 * 为什么需要它：**MCP 工具面不接 SSE**（见 ADR-0010：无长连接、`wait_for_turn` 有界轮询），
 * 所以只看订阅表的话，一个正在打牌的 agent 在别人屏幕上会永远显示「离线」。
 * 把「在线」定义成「有 SSE 订阅 **或** 最近活跃」，那颗点就说真话了：
 * 轮询期间是绿的，停手一个窗口之后转灰。
 *
 * 注意这是**身份级**的判定（按 `userId` 存），不是「在这张桌上」。所以「他刚上线」这件事
 * 要在**他出现的所有桌**上广播，见 `tables.ts` 的 `announce`。
 */
export const ACTIVE_WINDOW_MS = 60_000;

const lastSeen = new Map<number, number>();

function prune(reference: number): void {
  for (const [userId, at] of lastSeen) {
    if (reference - at >= ACTIVE_WINDOW_MS) lastSeen.delete(userId);
  }
}

/**
 * 记一次该身份的请求（view/action/mcp 都算）。
 *
 * 返回**这次请求是不是把他从「不在线」变成了「在线」** —— 只有翻转才值得推一帧给别人的屏幕。
 * 每个请求都推是不行的：`wait_for_turn` 每 1.5 秒就要读一次局面。
 */
export function touch(userId: number): boolean {
  const now = Date.now();
  prune(now);
  // prune 已经把过期项删掉了，所以 `has` 就是「本来就在线」
  const wasActive = lastSeen.has(userId);
  lastSeen.set(userId, now);
  return !wasActive;
}

export function isRecentlyActive(userId: number, windowMs: number = ACTIVE_WINDOW_MS): boolean {
  const at = lastSeen.get(userId);
  if (at === undefined) return false;
  if (Date.now() - at >= windowMs) {
    lastSeen.delete(userId);
    return false;
  }
  return true;
}
