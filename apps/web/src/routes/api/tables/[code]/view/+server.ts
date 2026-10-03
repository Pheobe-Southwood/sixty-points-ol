import { error, json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { getTableByCode, seatOf, tableView, viewFor } from '$lib/server/tables';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const table = getTableByCode(event.params.code);
  if (table === null) error(404, '同桌不存在');
  if (seatOf(table, identity.id) === null) error(403, '你不在该同桌的座位上');
  return json({ view: viewFor(table.id, identity.id), table: tableView(table) });
};
