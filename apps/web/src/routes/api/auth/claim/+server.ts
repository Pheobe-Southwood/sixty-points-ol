import { error, json } from '@sveltejs/kit';
import {
  credentialOf,
  findByCredential,
  normalizeName,
  register,
  setCredentialCookie
} from '$lib/server/auth';
import type { RequestHandler } from './$types';

/** 创建身份（传 name）或导入身份（传 credential）；两者都会下发凭据 cookie */
export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; credential?: unknown };

  if (typeof body.credential === 'string' && body.credential.trim().length > 0) {
    const identity = findByCredential(body.credential);
    if (identity === null) error(400, '凭据无效，请检查是否完整复制');
    const credential = credentialOf(identity);
    setCredentialCookie(cookies, credential);
    return json({ name: identity.name, credential });
  }

  const name = normalizeName(body.name);
  if (name === null) error(400, '名字需为 1-12 个字符，且不含冒号');
  const identity = register(name);
  const credential = credentialOf(identity);
  setCredentialCookie(cookies, credential);
  return json({ name: identity.name, credential });
};
