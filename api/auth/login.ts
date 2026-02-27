import { createSession, getUserByEmail, rateLimit, SESSION_COOKIE, verifyPassword } from '../_auth.js';
import { kvConfigured } from '../_kv.js';
import { PayloadTooLargeError, badRequest, getClientIp, json, methodNotAllowed, readJsonBody, setCookie } from '../_http.js';
import type { HttpRequest, HttpResponse } from '../_http.js';

export default async function handler(req: HttpRequest, res: HttpResponse) {
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

  const ip = getClientIp(req);
  const allowed = await rateLimit('login', ip, 30, 15 * 60);
  if (!allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED', message: 'Too many requests' });

  let body: Record<string, unknown> | null = null;
  try {
    const parsed = await readJsonBody(req);
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch (e) {
    if (e instanceof PayloadTooLargeError) {
      return json(res, 413, { ok: false, error: 'PAYLOAD_TOO_LARGE', message: e.message });
    }
    return badRequest(res, 'Invalid JSON');
  }

  const email = typeof body?.email === 'string' ? body.email : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email.trim() || !password) return badRequest(res, 'Missing email or password');

  const user = await getUserByEmail(email);
  const ok = user ? await verifyPassword(password, user.password) : false;
  if (!ok || !user) return json(res, 401, { ok: false, error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });

  const token = await createSession(user);
  setCookie(req, res, SESSION_COOKIE, token, { maxAgeSeconds: 60 * 60 * 24 * 30, httpOnly: true });
  return json(res, 200, { ok: true, user: { id: user.id, email: user.email } });
}
