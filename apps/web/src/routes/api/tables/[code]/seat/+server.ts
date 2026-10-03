import { error, json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { broadcast } from '$lib/server/hub';
import { getTableByCode, leaveSeat, takeSeat } from '$lib/server/tables';
import type { RequestHandler } from './$types';

/** 入座：观战者（或补位的人）占用第一个空座，继承该座位的级别与手牌（见 ADR-0009） */
export const POST: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const result = takeSeat(event.params.code, identity.id);
  if ('error' in result) error(400, result.error);
  const table = getTableByCode(event.params.code);
  if (table !== null) broadcast(table.id);
  return json({ seat: result.seat });
};

/** 离座：座位空出、本人转为观战者；本来不在座也返回成功（幂等） */
export const DELETE: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const result = leaveSeat(event.params.code, identity.id);
  if (!result.ok) error(400, result.message);
  const table = getTableByCode(event.params.code);
  if (table !== null) broadcast(table.id);
  return json({ ok: true });
};
