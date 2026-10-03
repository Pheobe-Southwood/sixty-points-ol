import { json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { createTable } from '$lib/server/tables';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const table = createTable(identity.id);
  return json({ code: table.code });
};
