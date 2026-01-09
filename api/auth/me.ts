import { getSession, getUserById, SESSION_COOKIE, touchSession } from '../_auth';
import { kvConfigured } from '../_kv';
import { json, methodNotAllowed, parseCookies, unauthorized } from '../_http';

export default async function handler(req: any, res: any) {
  if (!kvConfigured()) {
    return json(res, 501, {
      ok: false,
      error: 'KV_NOT_CONFIGURED',
      message:
        'Redis not configured. Set SYNC_REDIS_REST_URL + SYNC_REDIS_REST_TOKEN (recommended), or KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV), or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Upstash).',
    });
  }

  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET') return methodNotAllowed(res, ['GET']);

  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE] ?? '';
  if (!token) return unauthorized(res);

  const sess = await getSession(token);
  if (!sess) return unauthorized(res);

  const user = await getUserById(sess.userId);
  if (!user) return unauthorized(res);
  if (sess.sessionVersion !== user.sessionVersion) return unauthorized(res);

  await touchSession(token);
  return json(res, 200, { ok: true, user: { id: user.id, email: user.email } });
}

