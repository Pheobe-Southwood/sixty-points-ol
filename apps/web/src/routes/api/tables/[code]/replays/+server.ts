import { error, json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { replaysOf } from '$lib/server/replays';
import { getTableByCode } from '$lib/server/tables';
import type { RequestHandler } from './$types';

/**
 * 这张桌的全部**机器重演**（ADR-0016）：每副结算时服务端已同步算好的只读存档。
 *
 * 不进 SSE / `StreamPayload`：重演是按需查看的静态数据，塞进每一帧只会白涨负载
 * （MCP wire 也就一行都不用动）。任何身份（在座 / 观战）都能看 —— 结算后牌面本就全公开。
 */
export const GET: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const table = getTableByCode(event.params.code);
  if (table === null) error(404, '牌桌不存在');
  return json({ replays: replaysOf(table.id) });
};
