import { error, json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { addBot, removeBot } from '$lib/server/bots';
import type { RequestHandler } from './$types';

/**
 * 机器人座位的加/移（ADR-0015）。只有**在座的人类**能操作（`lib` 里校验）：
 * 观战者不该改变桌面构成，而机器人自己也没有凭据串、根本走不到这里。
 *
 * 推送由 lib 负责（见 ADR-0012）：路由只管「调 lib + 回 JSON」。
 */

/** 座位号：只接受 `"0"`/`"1"`/`"2"` 三个字面量，别的一律 null */
function parseSeat(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 0 && raw <= 2 ? raw : null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^[0-2]$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * 加机器人。`{ seat }` 可选：给了就坐那一张空座（界面每张空座卡有自己的按钮），
 * 不给就占第一个空座（`bot-check` 等脚本依赖这个默认）。
 *
 * 注意 `seat` 显式给了但非法（`3` / `"abc"`）要报 400，而不是悄悄退回第一个空座 ——
 * 否则「点了 3 号位却坐到 0 号位」这类偏差又回来了。
 */
export const POST: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const body = (await event.request.json().catch(() => ({}))) as { seat?: unknown };
  if (body.seat !== undefined) {
    const seat = parseSeat(body.seat);
    if (seat === null) error(400, '座位号不合法');
    const result = addBot(event.params.code, identity.id, seat);
    if (!result.ok) error(400, result.error);
    return json({ seat: result.value.seat, name: result.value.name });
  }
  const result = addBot(event.params.code, identity.id);
  if (!result.ok) error(400, result.error);
  return json({ seat: result.value.seat, name: result.value.name });
};

/** 移出机器人：离座语义（本副停在空座上等补位） */
export const DELETE: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  // 必须拿**原始字符串**判空：`Number(null)` 与 `Number('')` 都是 0，
  // 直接 Number(...) 会让「缺参数」被当成 0 号位 —— 守卫在最该生效的两种输入上失效，
  // 于是 `DELETE /bot`（不带参数）反而删掉了 0 号位的机器人并返回 200。
  const seat = parseSeat(event.url.searchParams.get('seat'));
  if (seat === null) error(400, '缺少合法的座位号');
  const result = removeBot(event.params.code, identity.id, seat);
  if (!result.ok) error(400, result.error);
  return json({ ok: true });
};
