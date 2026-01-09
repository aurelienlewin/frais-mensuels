import { deleteSession, SESSION_COOKIE } from '../_auth';
import { kvConfigured } from '../_kv';
import { clearCookie, json, methodNotAllowed, parseCookies } from '../_http';

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
  if (method !== 'POST') return methodNotAllowed(res, ['POST']);

  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE] ?? '';
  if (token) await deleteSession(token);

  clearCookie(res, SESSION_COOKIE);
  return json(res, 200, { ok: true });
}

