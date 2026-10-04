import { json } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { createTable, myTables } from '$lib/server/tables';
import type { RequestHandler } from './$types';

/** 我在哪几张桌上：大厅页面与 MCP 的 list_my_tables 共用同一份（含我在那张桌的角色） */
export const GET: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  return json({ tables: myTables(identity.id) });
};

export const POST: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const table = createTable(identity.id);
  return json({ code: table.code });
};
