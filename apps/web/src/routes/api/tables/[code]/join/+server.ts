import { error, json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { joinTable } from '$lib/server/tables';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const result = joinTable(event.params.code, identity.id);
  if ('error' in result) error(400, result.error);
  return json({ code: result.table.code, seat: result.seat });
};
