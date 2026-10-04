import { error, json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { addBot, removeBot } from '$lib/server/bots';
import type { RequestHandler } from './$types';

/**
 * 机器人座位的加/移（ADR-0014）。只有**在座的人类**能操作（`lib` 里校验）：
 * 观战者不该改变桌面构成，而机器人自己也没有凭据串、根本走不到这里。
 *
 * 座位号由服务端推导（占第一个空座）；移出用 `?seat=N` 指定。
 * 推送由 lib 负责（见 ADR-0012）：路由只管「调 lib + 回 JSON」。
 */

/** 加机器人：占第一个空座；进行中加入即补位（接手该座位的手牌与级别） */
export const POST: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const result = addBot(event.params.code, identity.id);
  if (!result.ok) error(400, result.error);
  return json({ seat: result.value.seat, name: result.value.name });
};

/** 移出机器人：离座语义（本副停在空座上等补位） */
export const DELETE: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const seat = Number(event.url.searchParams.get('seat'));
  if (!Number.isInteger(seat) || seat < 0 || seat > 2) error(400, '缺少合法的座位号');
  const result = removeBot(event.params.code, identity.id, seat);
  if (!result.ok) error(400, result.error);
  return json({ ok: true });
};
