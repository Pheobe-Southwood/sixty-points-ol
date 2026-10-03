import { json } from '@sveltejs/kit';
import { clearCredentialCookie } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
  clearCredentialCookie(cookies);
  return json({ ok: true });
};
