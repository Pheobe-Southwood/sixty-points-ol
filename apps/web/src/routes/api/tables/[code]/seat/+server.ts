import { error, json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { leaveSeat, takeSeat } from '$lib/server/tables';
import type { RequestHandler } from './$types';

// 座位变化引起的推送由 lib 负责（见 ADR-0012）：路由只管「调 lib + 回 JSON」，
// 免得下一个人再加一条变化路径时又忘了广播。

/** 入座：观战者（或补位的人）占用第一个空座，继承该座位的级别与手牌（见 ADR-0009） */
export const POST: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const result = takeSeat(event.params.code, identity.id);
  if ('error' in result) error(400, result.error);
  return json({ seat: result.seat, inherited: result.inherited });
};

/** 离座：座位空出、本人转为观战者；本来不在座也返回成功（幂等） */
export const DELETE: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const result = leaveSeat(event.params.code, identity.id);
  if (!result.ok) error(400, result.message);
  return json({ ok: true });
};
