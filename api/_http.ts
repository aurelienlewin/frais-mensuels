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

const DEFAULT_MAX_JSON_BYTES = 1_000_000; // ~1MB

export class PayloadTooLargeError extends Error {
  code = 'PAYLOAD_TOO_LARGE' as const;
  status = 413 as const;
  constructor(maxBytes: number) {
    super(`Payload too large (max ${maxBytes} bytes)`);
    this.name = 'PayloadTooLargeError';
  }
}

export async function readJsonBody(req: any, opts?: { maxBytes?: number }): Promise<any | null> {
  if (req.body && typeof req.body === 'object') return req.body;
  const maxBytes = Math.max(1, Math.floor(opts?.maxBytes ?? DEFAULT_MAX_JSON_BYTES));
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    total += bytes.length;
    if (total > maxBytes) {
      if (typeof req?.destroy === 'function') req.destroy();
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(bytes);
  }
  if (chunks.length === 0) return null;
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

function trustProxy(env: Record<string, string | undefined>): boolean {
  return String(env.TRUST_PROXY || '').toLowerCase() === 'true' || Boolean(env.VERCEL) || Boolean(env.VERCEL_ENV);
}

export function getClientIp(req: any, opts?: { trustProxy?: boolean }): string {
  const env = ((globalThis as any)?.process?.env ?? {}) as Record<string, string | undefined>;
  const shouldTrustProxy = typeof opts?.trustProxy === 'boolean' ? opts.trustProxy : trustProxy(env);
  if (shouldTrustProxy) {
    const xf = req?.headers?.['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0]!.trim();
    const xr = req?.headers?.['x-real-ip'];
    if (typeof xr === 'string' && xr.trim()) return xr.trim();
  }
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
    const raw = rest.join('=').trim() || '';
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

function isSecureRequest(req: any, env: Record<string, string | undefined>): boolean {
  // Prefer trusted proxy headers when available (Vercel / reverse proxies).
  const proto = req?.headers?.['x-forwarded-proto'] ?? req?.headers?.['x-forwarded-protocol'];
  if (typeof proto === 'string' && proto.trim()) {
    const p = proto.split(',')[0]!.trim().toLowerCase();
    if (p === 'https') return true;
    if (p === 'http') return false;
  }

  const xfSsl = req?.headers?.['x-forwarded-ssl'];
  if (typeof xfSsl === 'string' && xfSsl.trim().toLowerCase() === 'on') return true;

  // Direct TLS (non-proxied).
  if (req?.socket?.encrypted) return true;
  if (req?.connection?.encrypted) return true;

  // Best-effort fallback: Vercel prod/preview are always HTTPS from the browser.
  const vercelEnv = String(env.VERCEL_ENV || '').toLowerCase();
  if ((env.VERCEL || env.VERCEL_ENV) && vercelEnv && vercelEnv !== 'development') return true;

  return false;
}

export function setCookie(
  req: any,
  res: any,
  name: string,
  value: string,
  opts?: { maxAgeSeconds?: number; httpOnly?: boolean },
) {
  const httpOnly = opts?.httpOnly !== false;
  const maxAge = typeof opts?.maxAgeSeconds === 'number' ? Math.max(0, Math.floor(opts.maxAgeSeconds)) : undefined;
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');

  // Best-effort: set Secure when behind HTTPS (Vercel / reverse proxy) or forced via env.
  const env = ((globalThis as any)?.process?.env ?? {}) as Record<string, string | undefined>;
  const forceSecure = String(env.FORCE_SECURE_COOKIES || '').toLowerCase() === 'true';
  const secure = forceSecure || isSecureRequest(req, env);
  if (secure) parts.push('Secure');

  if (typeof maxAge === 'number') {
    parts.push(`Max-Age=${maxAge}`);
    parts.push(`Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`);
  }
  const existing = res.getHeader('Set-Cookie');
  const next = typeof existing === 'string' ? [existing, parts.join('; ')] : Array.isArray(existing) ? [...existing, parts.join('; ')] : [parts.join('; ')];
  res.setHeader('Set-Cookie', next);
}

export function clearCookie(req: any, res: any, name: string) {
  setCookie(req, res, name, '', { maxAgeSeconds: 0 });
}
