import { error, redirect } from '@sveltejs/kit';
import { credentialOf, identityFrom } from '$lib/server/auth';
import { getTableByCode, joinTable, seatOf, tableView, viewFor } from '$lib/server/tables';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const identity = identityFrom(event);
  if (identity === null) redirect(307, '/');

  const code = event.params.code.toUpperCase();
  let table = getTableByCode(code);
  if (table === null) error(404, '同桌不存在，请确认邀请码');

  // 凭邀请码进入即自动入座（满座则报错）
  if (seatOf(table, identity.id) === null) {
    const joined = joinTable(code, identity.id);
    if ('error' in joined) error(403, joined.error);
    table = joined.table;
  }

  return {
    code: table.code,
    seat: seatOf(table, identity.id)!,
    me: { name: identity.name, credential: credentialOf(identity) },
    view: viewFor(table.id, identity.id),
    table: tableView(table)
  };
};
