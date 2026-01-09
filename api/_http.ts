export function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function badRequest(res: any, message: string) {
  return json(res, 400, { ok: false, error: 'BAD_REQUEST', message });
}

export function unauthorized(res: any, message = 'Unauthorized') {
  return json(res, 401, { ok: false, error: 'UNAUTHORIZED', message });
}

export function notFound(res: any) {
  return json(res, 404, { ok: false, error: 'NOT_FOUND' });
}

export function methodNotAllowed(res: any, allow: string[]) {
  res.statusCode = 405;
  res.setHeader('Allow', allow.join(', '));
  res.setHeader('Cache-Control', 'no-store');
  res.end('Method Not Allowed');
}

export function serverError(res: any, message = 'Server error') {
  return json(res, 500, { ok: false, error: 'SERVER_ERROR', message });
}

export async function readJsonBody(req: any): Promise<any | null> {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    chunks.push(bytes);
  }
  if (chunks.length === 0) return null;
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  const raw = new TextDecoder().decode(merged);
  if (!raw) return null;
  return JSON.parse(raw);
}

export function getClientIp(req: any): string {
  const xf = req?.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0]!.trim();
  const xr = req?.headers?.['x-real-ip'];
  if (typeof xr === 'string' && xr.trim()) return xr.trim();
  const ra = req?.socket?.remoteAddress;
  return typeof ra === 'string' && ra.trim() ? ra.trim() : '0.0.0.0';
}

export function parseCookies(req: any): Record<string, string> {
  const header = req?.headers?.cookie;
  if (typeof header !== 'string' || !header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.split('=');
    const key = (k ?? '').trim();
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join('=').trim() || '');
  }
  return out;
}

export function setCookie(res: any, name: string, value: string, opts?: { maxAgeSeconds?: number; httpOnly?: boolean }) {
  const httpOnly = opts?.httpOnly !== false;
  const maxAge = typeof opts?.maxAgeSeconds === 'number' ? Math.max(0, Math.floor(opts.maxAgeSeconds)) : undefined;
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');

  // Best-effort: set Secure when behind HTTPS (Vercel) or forced via env.
  const forceSecure = String(process.env.FORCE_SECURE_COOKIES || '').toLowerCase() === 'true';
  const onVercel = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
  if (forceSecure || onVercel) parts.push('Secure');

  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);
  const existing = res.getHeader('Set-Cookie');
  const next = typeof existing === 'string' ? [existing, parts.join('; ')] : Array.isArray(existing) ? [...existing, parts.join('; ')] : [parts.join('; ')];
  res.setHeader('Set-Cookie', next);
}

export function clearCookie(res: any, name: string) {
  setCookie(res, name, '', { maxAgeSeconds: 0 });
}
