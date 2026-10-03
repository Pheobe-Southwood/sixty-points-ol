import { error, json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { enterTable } from '$lib/server/tables';
import type { RequestHandler } from './$types';

/** 进入同桌：有空座就入座，满座则以观战身份进入（不再报「该同桌已满」） */
export const POST: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const result = enterTable(event.params.code, identity.id);
  if ('error' in result) error(400, result.error);
  return json({
    code: result.table.code,
    role: result.role,
    seat: result.role === 'player' ? result.seat : null
  });
};
