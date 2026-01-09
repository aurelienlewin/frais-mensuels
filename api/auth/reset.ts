import { createPasswordHash, createRecoveryCode, createSession, getUserByEmail, passwordPolicy, putUser, rateLimit, SESSION_COOKIE, verifyRecoveryCode } from '../_auth.js';
import { kvConfigured } from '../_kv.js';
import { badRequest, getClientIp, json, methodNotAllowed, readJsonBody, setCookie } from '../_http.js';

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

  const ip = getClientIp(req);
  const allowed = await rateLimit('reset', ip, 10, 60 * 60);
  if (!allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED', message: 'Too many requests' });

  let body: any = null;
  try {
    body = await readJsonBody(req);
  } catch {
    return badRequest(res, 'Invalid JSON');
  }

  const email = typeof body?.email === 'string' ? body.email : '';
  const recoveryCode = typeof body?.recoveryCode === 'string' ? body.recoveryCode : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  if (!email.trim() || !recoveryCode.trim() || !newPassword) return badRequest(res, 'Missing fields');

  const policy = passwordPolicy(email, newPassword);
  if (!policy.ok) return json(res, 400, { ok: false, error: 'WEAK_PASSWORD', reasons: policy.reasons });

  const user = await getUserByEmail(email);
  if (!user) return json(res, 401, { ok: false, error: 'INVALID_RECOVERY', message: 'Invalid recovery code' });
  const ok = await verifyRecoveryCode(recoveryCode.trim(), user.recovery);
  if (!ok) return json(res, 401, { ok: false, error: 'INVALID_RECOVERY', message: 'Invalid recovery code' });

  const password = await createPasswordHash(newPassword);
  const nextRecovery = await createRecoveryCode();
  const updatedAt = new Date().toISOString();
  const nextUser = {
    ...user,
    updatedAt,
    password,
    recovery: nextRecovery.hash,
    sessionVersion: (user.sessionVersion ?? 1) + 1,
  };
  await putUser(nextUser);

  const token = await createSession(nextUser);
  setCookie(res, SESSION_COOKIE, token, { maxAgeSeconds: 60 * 60 * 24 * 30, httpOnly: true });
  return json(res, 200, { ok: true, user: { id: nextUser.id, email: nextUser.email }, recoveryCode: nextRecovery.code });
}
