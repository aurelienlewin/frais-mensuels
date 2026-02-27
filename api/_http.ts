export type HttpHeaders = Record<string, string | string[] | undefined>;

export type HttpRequest = AsyncIterable<Uint8Array | string> & {
  method?: string;
  headers?: HttpHeaders;
  body?: unknown;
  socket?: { remoteAddress?: string | undefined; encrypted?: boolean };
  connection?: { encrypted?: boolean };
  destroy?: () => void;
};

export type HttpResponse = {
  statusCode: number;
  setHeader(name: string, value: string | string[]): void;
  getHeader(name: string): string | string[] | number | undefined;
  end(body?: string | Uint8Array): void;
};

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value : '';
}

function readEnv(): Record<string, string | undefined> {
  const globalObj = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return globalObj.process?.env ?? {};
}

export function json(res: HttpResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function badRequest(res: HttpResponse, message: string) {
  return json(res, 400, { ok: false, error: 'BAD_REQUEST', message });
}

export function unauthorized(res: HttpResponse, message = 'Unauthorized') {
  return json(res, 401, { ok: false, error: 'UNAUTHORIZED', message });
}

export function notFound(res: HttpResponse) {
  return json(res, 404, { ok: false, error: 'NOT_FOUND' });
}

export function methodNotAllowed(res: HttpResponse, allow: string[]) {
  res.statusCode = 405;
  res.setHeader('Allow', allow.join(', '));
  res.setHeader('Cache-Control', 'no-store');
  res.end('Method Not Allowed');
}

export function serverError(res: HttpResponse, message = 'Server error') {
  return json(res, 500, { ok: false, error: 'SERVER_ERROR', message });
}

const DEFAULT_MAX_JSON_BYTES = 1_000_000;

export class PayloadTooLargeError extends Error {
  code = 'PAYLOAD_TOO_LARGE' as const;
  status = 413 as const;
  constructor(maxBytes: number) {
    super(`Payload too large (max ${maxBytes} bytes)`);
    this.name = 'PayloadTooLargeError';
  }
}

export async function readJsonBody(req: HttpRequest, opts?: { maxBytes?: number }): Promise<unknown | null> {
  if (req.body && typeof req.body === 'object') return req.body;
  const maxBytes = Math.max(1, Math.floor(opts?.maxBytes ?? DEFAULT_MAX_JSON_BYTES));
  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const chunk of req) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    total += bytes.length;
    if (total > maxBytes) {
      if (typeof req.destroy === 'function') req.destroy();
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(bytes);
  }

  if (chunks.length === 0) return null;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  const raw = new TextDecoder().decode(merged);
  if (!raw) return null;
  return JSON.parse(raw);
}

function trustProxy(env: Record<string, string | undefined>): boolean {
  return String(env.TRUST_PROXY || '').toLowerCase() === 'true' || Boolean(env.VERCEL) || Boolean(env.VERCEL_ENV);
}

export function getClientIp(req: HttpRequest, opts?: { trustProxy?: boolean }): string {
  const env = readEnv();
  const shouldTrustProxy = typeof opts?.trustProxy === 'boolean' ? opts.trustProxy : trustProxy(env);

  if (shouldTrustProxy) {
    const xf = firstHeaderValue(req.headers?.['x-forwarded-for']);
    if (xf.trim()) return xf.split(',')[0]!.trim();
    const xr = firstHeaderValue(req.headers?.['x-real-ip']);
    if (xr.trim()) return xr.trim();
  }

  const remoteAddress = req.socket?.remoteAddress;
  return typeof remoteAddress === 'string' && remoteAddress.trim() ? remoteAddress.trim() : '0.0.0.0';
}

export function parseCookies(req: HttpRequest): Record<string, string> {
  const header = firstHeaderValue(req.headers?.cookie);
  if (!header) return {};

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

function isSecureRequest(req: HttpRequest, env: Record<string, string | undefined>): boolean {
  const protoHeader = req.headers?.['x-forwarded-proto'] ?? req.headers?.['x-forwarded-protocol'];
  const proto = firstHeaderValue(protoHeader).trim().toLowerCase();
  if (proto === 'https') return true;
  if (proto === 'http') return false;

  const forwardedSsl = firstHeaderValue(req.headers?.['x-forwarded-ssl']).trim().toLowerCase();
  if (forwardedSsl === 'on') return true;

  if (req.socket?.encrypted) return true;
  if (req.connection?.encrypted) return true;

  const vercelEnv = String(env.VERCEL_ENV || '').toLowerCase();
  if ((env.VERCEL || env.VERCEL_ENV) && vercelEnv && vercelEnv !== 'development') return true;

  return false;
}

export function setCookie(
  req: HttpRequest,
  res: HttpResponse,
  name: string,
  value: string,
  opts?: { maxAgeSeconds?: number; httpOnly?: boolean },
) {
  const httpOnly = opts?.httpOnly !== false;
  const maxAge = typeof opts?.maxAgeSeconds === 'number' ? Math.max(0, Math.floor(opts.maxAgeSeconds)) : undefined;
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');

  const env = readEnv();
  const forceSecure = String(env.FORCE_SECURE_COOKIES || '').toLowerCase() === 'true';
  const secure = forceSecure || isSecureRequest(req, env);
  if (secure) parts.push('Secure');

  if (typeof maxAge === 'number') {
    parts.push(`Max-Age=${maxAge}`);
    parts.push(`Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`);
  }

  const nextCookie = parts.join('; ');
  const existing = res.getHeader('Set-Cookie');
  const next = typeof existing === 'string' ? [existing, nextCookie] : Array.isArray(existing) ? [...existing, nextCookie] : [nextCookie];
  res.setHeader('Set-Cookie', next);
}

export function clearCookie(req: HttpRequest, res: HttpResponse, name: string) {
  setCookie(req, res, name, '', { maxAgeSeconds: 0 });
}
