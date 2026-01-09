function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function badRequest(res: any, message: string) {
  return json(res, 400, { ok: false, error: 'BAD_REQUEST', message });
}

function serverError(res: any, message: string) {
  return json(res, 500, { ok: false, error: 'SERVER_ERROR', message });
}

function notFound(res: any) {
  return json(res, 404, { ok: false, error: 'NOT_FOUND' });
}

function methodNotAllowed(res: any) {
  res.statusCode = 405;
  res.setHeader('Allow', 'GET, POST');
  res.setHeader('Cache-Control', 'no-store');
  res.end('Method Not Allowed');
}

async function readJsonBody(req: any): Promise<any | null> {
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

const PREFIX = 'fm:sync:';
const CHUNK_SIZE = 700; // keep /set/<key>/<value> URLs safely below common limits

function kvEnv() {
  const url = (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '').trim();
  const token = (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/g, ''), token };
}

async function kvGet(key: string): Promise<string | null> {
  const env = kvEnv();
  if (!env) throw new Error('KV not configured');
  const res = await fetch(`${env.url}/get/${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${env.token}` },
  });
  const body = (await res.json().catch(() => null)) as { result?: unknown } | null;
  if (!res.ok) throw new Error('KV get failed');
  if (!body || !('result' in body)) return null;
  return typeof body.result === 'string' ? body.result : body.result == null ? null : String(body.result);
}

async function kvSet(key: string, value: string): Promise<void> {
  const env = kvEnv();
  if (!env) throw new Error('KV not configured');
  const res = await fetch(`${env.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}` },
  });
  if (!res.ok) throw new Error('KV set failed');
}

function chunkString(value: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
  return chunks;
}

export default async function handler(req: any, res: any) {
  const env = kvEnv();
  if (!env) {
    return json(res, 501, {
      ok: false,
      error: 'KV_NOT_CONFIGURED',
      message: 'Vercel KV is not configured for this deployment.',
    });
  }

  const url = new URL(req.url, 'http://localhost');
  const method = String(req.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const id = url.searchParams.get('id') ?? '';
    if (!id) return badRequest(res, 'Missing id');
    if (id.length > 128) return badRequest(res, 'Invalid id');

    const base = `${PREFIX}${id}`;
    const metaRaw = await kvGet(`${base}:meta`);
    if (!metaRaw) return notFound(res);

    let meta: { v: 1; modifiedAt: string; updatedAt: string; payloadChunks: number } | null = null;
    try {
      meta = JSON.parse(metaRaw) as typeof meta;
    } catch {
      return serverError(res, 'Corrupted sync metadata');
    }
    if (!meta || meta.v !== 1 || typeof meta.payloadChunks !== 'number') return serverError(res, 'Invalid sync metadata');

    const chunks: string[] = [];
    for (let i = 0; i < meta.payloadChunks; i += 1) {
      const part = await kvGet(`${base}:p:${i}`);
      if (typeof part !== 'string') return serverError(res, 'Missing sync data chunk');
      chunks.push(part);
    }
    const payloadRaw = chunks.join('');
    let payload: unknown = null;
    try {
      payload = JSON.parse(payloadRaw);
    } catch {
      return serverError(res, 'Corrupted sync payload');
    }

    return json(res, 200, { ok: true, record: { v: 1, modifiedAt: meta.modifiedAt, updatedAt: meta.updatedAt, payload } });
  }

  if (method === 'POST') {
    const body = await readJsonBody(req).catch(() => null);
    if (!body || typeof body !== 'object') return badRequest(res, 'Invalid JSON body');
    const id = typeof (body as any).id === 'string' ? (body as any).id : '';
    const modifiedAt = typeof (body as any).modifiedAt === 'string' ? (body as any).modifiedAt : '';
    const payload = (body as any).payload;

    if (!id) return badRequest(res, 'Missing id');
    if (id.length > 128) return badRequest(res, 'Invalid id');
    if (!modifiedAt) return badRequest(res, 'Missing modifiedAt');
    if (!payload || typeof payload !== 'object') return badRequest(res, 'Missing payload');

    const base = `${PREFIX}${id}`;
    const updatedAt = new Date().toISOString();

    const payloadRaw = JSON.stringify(payload);
    const payloadChunks = chunkString(payloadRaw);

    // Write chunks first, then update meta last (so readers never see a meta pointing to missing chunks).
    for (let i = 0; i < payloadChunks.length; i += 1) {
      await kvSet(`${base}:p:${i}`, payloadChunks[i]!);
    }

    const meta = { v: 1, modifiedAt, updatedAt, payloadChunks: payloadChunks.length };
    await kvSet(`${base}:meta`, JSON.stringify(meta));

    return json(res, 200, { ok: true, record: { v: 1, modifiedAt, updatedAt, payload } });
  }

  return methodNotAllowed(res);
}
