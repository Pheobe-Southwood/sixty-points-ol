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

export function broadcast(tableId: number): void {
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
