import { redirect } from '@sveltejs/kit';
import { credentialOf, identityFrom } from '$lib/server/auth';
import { tablesOf, tableView } from '$lib/server/tables';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const identity = identityFrom(event);
  if (identity === null) {
    return { me: null, credential: null, myTables: [] as { code: string; seated: number }[] };
  }
  const myTables = tablesOf(identity.id).map((table) => {
    const view = tableView(table);
    return { code: table.code, seated: view.seatedCount };
  });
  return { me: { name: identity.name }, credential: credentialOf(identity), myTables };
};

export const actions = {
  logout: async (event) => {
    const { clearCredentialCookie } = await import('$lib/server/auth');
    clearCredentialCookie(event.cookies);
    redirect(303, '/');
  }
};
