import { error, json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { getTableByCode, payloadFor } from '$lib/server/tables';
import type { RequestHandler } from './$types';

/** 拉取当前负载：在座拿到个人视图，观战者拿到公共视图（角色按数据库现算） */
export const GET: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const table = getTableByCode(event.params.code);
  if (table === null) error(404, '同桌不存在');
  return json(payloadFor(table, identity.id));
};
