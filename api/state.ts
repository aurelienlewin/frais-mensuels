import { getSession, getUserById, SESSION_COOKIE, touchSession } from './_auth.js';
import { kvConfigured, kvGet, kvSet } from './_kv.js';
import { badRequest, json, methodNotAllowed, parseCookies, readJsonBody, unauthorized } from './_http.js';

const PREFIX = 'fm:state:';
const CHUNK_SIZE = 700;

function compareIso(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function chunkString(value: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
  return chunks;
}

type StateMetaV1 = { v: 1; modifiedAt: string; updatedAt: string; chunks: number };

function metaKey(userId: string) {
  return `${PREFIX}${userId}:meta`;
}
function partKey(userId: string, idx: number) {
  return `${PREFIX}${userId}:p:${idx}`;
}

async function getStateMeta(userId: string): Promise<StateMetaV1 | null> {
  const raw = await kvGet(metaKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StateMetaV1;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function getStateRecord(userId: string): Promise<{ meta: StateMetaV1; state: unknown } | null> {
  const meta = await getStateMeta(userId);
  if (!meta) return null;
  const chunks: string[] = [];
  for (let i = 0; i < meta.chunks; i += 1) {
    const part = await kvGet(partKey(userId, i));
    if (typeof part !== 'string') return null;
    chunks.push(part);
  }
  const raw = chunks.join('');
  try {
    const state = JSON.parse(raw) as unknown;
    return { meta, state };
  } catch {
    return null;
  }
}

async function putStateRecord(userId: string, modifiedAt: string, state: unknown): Promise<StateMetaV1> {
  const updatedAt = new Date().toISOString();
  const raw = JSON.stringify(state);
  const chunks = chunkString(raw);
  for (let i = 0; i < chunks.length; i += 1) {
    await kvSet(partKey(userId, i), chunks[i]!);
  }
  const meta: StateMetaV1 = { v: 1, modifiedAt, updatedAt, chunks: chunks.length };
  await kvSet(metaKey(userId), JSON.stringify(meta));
  return meta;
}

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
  if (method !== 'GET' && method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE] ?? '';
  if (!token) return unauthorized(res);

  const sess = await getSession(token);
  if (!sess) return unauthorized(res);

  const user = await getUserById(sess.userId);
  if (!user) return unauthorized(res);
  if (sess.sessionVersion !== user.sessionVersion) return unauthorized(res);
  await touchSession(token);

  if (method === 'GET') {
    const rec = await getStateRecord(user.id);
    if (!rec) return json(res, 200, { ok: true, record: null });
    return json(res, 200, { ok: true, record: { ...rec.meta, state: rec.state } });
  }

  let body: any = null;
  try {
    body = await readJsonBody(req);
  } catch {
    return badRequest(res, 'Invalid JSON');
  }

  const state = body?.state as unknown;
  if (!state || typeof state !== 'object') return badRequest(res, 'Missing state');
  const modifiedAtRaw = typeof body?.modifiedAt === 'string' ? body.modifiedAt : (state as any)?.modifiedAt;
  const modifiedAt = typeof modifiedAtRaw === 'string' && modifiedAtRaw.length <= 64 ? modifiedAtRaw : new Date().toISOString();

  const remoteMeta = await getStateMeta(user.id);
  if (remoteMeta && compareIso(remoteMeta.modifiedAt, modifiedAt) > 0) {
    return json(res, 409, { ok: false, error: 'CONFLICT', record: remoteMeta });
  }

  const meta = await putStateRecord(user.id, modifiedAt, state);
  return json(res, 200, { ok: true, record: meta });
}
