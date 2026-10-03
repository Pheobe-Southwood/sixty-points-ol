import { redirect } from '@sveltejs/kit';
import { credentialOf, identityFrom } from '$lib/server/auth';
import { myTables, type MyTable } from '$lib/server/tables';
import { normalizeInvite } from '$lib/invite';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  // 从邀请链接被带到大厅时带着邀请码：注册/导入身份后自动回到那张桌
  const join = normalizeInvite(event.url.searchParams.get('join') ?? '');
  const identity = identityFrom(event);
  if (identity === null) {
    return { me: null, credential: null, myTables: [] as MyTable[], join };
  }
  return {
    me: { name: identity.name },
    credential: credentialOf(identity),
    myTables: myTables(identity.id),
    join
  };
};

export const actions = {
  logout: async (event) => {
    const { clearCredentialCookie } = await import('$lib/server/auth');
    clearCredentialCookie(event.cookies);
    redirect(303, '/');
  }
};
