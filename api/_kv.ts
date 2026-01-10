type KvEnv = { url: string; token: string };

function kvEnv(): KvEnv | null {
  const env = ((globalThis as any)?.process?.env ?? {}) as Record<string, string | undefined>;
  const url = (
    env.SYNC_REDIS_REST_URL ??
    env.KV_REST_API_URL ??
    env.UPSTASH_REDIS_REST_URL ??
    ''
  ).trim();
  const token = (
    env.SYNC_REDIS_REST_TOKEN ??
    env.KV_REST_API_TOKEN ??
    env.UPSTASH_REDIS_REST_TOKEN ??
    ''
  ).trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/g, ''), token };
}

async function parseJson(res: Response): Promise<unknown | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function kvFetch(path: string, method: 'GET' | 'POST'): Promise<unknown> {
  const env = kvEnv();
  if (!env) throw new Error('KV_NOT_CONFIGURED');

  const res = await fetch(`${env.url}${path}`, { method, headers: { Authorization: `Bearer ${env.token}` } });
  const body = await parseJson(res);
  if (!res.ok) throw new Error('KV_ERROR');
  return body;
}

function toScalarResult(body: unknown): unknown {
  if (!body || typeof body !== 'object') return null;
  if (!('result' in body)) return null;
  return (body as { result?: unknown }).result;
}

export async function kvGet(key: string): Promise<string | null> {
  const body = await kvFetch(`/get/${encodeURIComponent(key)}`, 'GET');
  const result = toScalarResult(body);
  if (typeof result === 'string') return result;
  if (result == null) return null;
  return String(result);
}

export async function kvSet(key: string, value: string): Promise<void> {
  await kvFetch(`/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, 'POST');
}

export async function kvDel(key: string): Promise<number> {
  const body = await kvFetch(`/del/${encodeURIComponent(key)}`, 'POST');
  const result = toScalarResult(body);
  if (typeof result === 'number') return result;
  const n = Number(result);
  return Number.isFinite(n) ? n : 0;
}

export async function kvIncr(key: string): Promise<number> {
  const body = await kvFetch(`/incr/${encodeURIComponent(key)}`, 'POST');
  const result = toScalarResult(body);
  if (typeof result === 'number') return result;
  const n = Number(result);
  if (!Number.isFinite(n)) throw new Error('KV_INVALID_INCR');
  return n;
}

export async function kvExpire(key: string, seconds: number): Promise<void> {
  const s = Math.max(1, Math.floor(seconds));
  await kvFetch(`/expire/${encodeURIComponent(key)}/${encodeURIComponent(String(s))}`, 'POST');
}

export function kvConfigured(): boolean {
  return Boolean(kvEnv());
}
