import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { getSession, getUserById, SESSION_COOKIE, touchSession } from './_auth.js';
import { kvConfigured, kvGet, kvSet } from './_kv.js';
import { badRequest, json, methodNotAllowed, parseCookies, readJsonBody, setCookie, unauthorized } from './_http.js';

const PREFIX = 'fm:state:';
const CHUNK_SIZE = 900;
const STATE_SECRET_ENV_KEYS = ['SYNC_STATE_SECRET', 'KV_STATE_SECRET', 'STATE_SECRET', 'SYNC_REDIS_STATE_SECRET'];

let cachedStateKey: Buffer | null | undefined = undefined;

function readEnv(): Record<string, string | undefined> {
  return ((globalThis as any)?.process?.env ?? {}) as Record<string, string | undefined>;
}

function resolveStateKey(): Buffer | null {
  if (cachedStateKey !== undefined) return cachedStateKey;
  const env = readEnv();
  const secret = STATE_SECRET_ENV_KEYS.map((k) => env[k] || '').find((v) => v && v.trim());
  if (!secret) {
    cachedStateKey = null;
    return null;
  }
  cachedStateKey = createHash('sha256').update(secret.trim()).digest();
  return cachedStateKey;
}

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
type StateMetaV2 = {
  v: 2;
  modifiedAt: string;
  updatedAt: string;
  chunks: number;
  enc: 'deflate' | 'deflate+aes-256-gcm';
  rawLen: number;
  payloadLen: number;
};
type StateMeta = StateMetaV1 | StateMetaV2;

function metaKey(userId: string) {
  return `${PREFIX}${userId}:meta`;
}
function partKey(userId: string, idx: number) {
  return `${PREFIX}${userId}:p:${idx}`;
}

function isStateMeta(m: any): m is StateMeta {
  if (!m || typeof m !== 'object') return false;
  if (m.v === 1) return typeof m.modifiedAt === 'string' && typeof m.updatedAt === 'string' && typeof m.chunks === 'number';
  if (m.v === 2)
    return (
      (m.enc === 'deflate' || m.enc === 'deflate+aes-256-gcm') &&
      typeof m.modifiedAt === 'string' &&
      typeof m.updatedAt === 'string' &&
      typeof m.chunks === 'number' &&
      typeof m.rawLen === 'number' &&
      (typeof m.payloadLen === 'number' || typeof m.compressedLen === 'number')
    );
  return false;
}

async function getStateMeta(userId: string): Promise<StateMeta | null> {
  const raw = await kvGet(metaKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isStateMeta(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function encryptPayload(payload: Buffer, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptPayload(payload: string, key: Buffer): Buffer | null {
  try {
    const buf = Buffer.from(payload, 'base64');
    if (buf.length < 12 + 16) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    return null;
  }
}

function encodeStatePayload(state: unknown): { payload: string; rawLen: number; payloadLen: number; enc: StateMetaV2['enc'] } {
  const json = JSON.stringify(state);
  const rawBuf = Buffer.from(json, 'utf8');
  const compressed = deflateSync(rawBuf);
  const key = resolveStateKey();
  if (key) {
    const encrypted = encryptPayload(compressed, key);
    return { payload: encrypted, rawLen: rawBuf.byteLength, payloadLen: encrypted.length, enc: 'deflate+aes-256-gcm' };
  }
  const payload = compressed.toString('base64');
  return { payload, rawLen: rawBuf.byteLength, payloadLen: payload.length, enc: 'deflate' };
}

function decodeStatePayload(meta: StateMeta, raw: string): unknown {
  if (meta.v === 2) {
    if (meta.enc === 'deflate+aes-256-gcm') {
      const key = resolveStateKey();
      if (!key) throw new Error('STATE_DECRYPT_KEY_MISSING');
      const decrypted = decryptPayload(raw, key);
      if (!decrypted) throw new Error('STATE_DECRYPT_FAILED');
      const inflated = inflateSync(decrypted);
      return JSON.parse(inflated.toString('utf8'));
    }
    const buf = Buffer.from(raw, 'base64');
    const inflated = inflateSync(buf);
    return JSON.parse(inflated.toString('utf8'));
  }
  return JSON.parse(raw);
}

async function getStateRecord(userId: string): Promise<{ meta: StateMeta; state: unknown } | null> {
  const meta = await getStateMeta(userId);
  if (!meta) return null;
  const chunks: string[] = [];
  for (let i = 0; i < meta.chunks; i += 1) {
    const part = await kvGet(partKey(userId, i));
    if (typeof part !== 'string') return null;
    chunks.push(part);
  }
  const raw = chunks.join('');
  const state = decodeStatePayload(meta, raw);
  return { meta, state };
}

async function putStateRecord(userId: string, modifiedAt: string, state: unknown): Promise<StateMeta> {
  const updatedAt = new Date().toISOString();
  const encoded = encodeStatePayload(state);
  const chunks = chunkString(encoded.payload);
  for (let i = 0; i < chunks.length; i += 1) {
    await kvSet(partKey(userId, i), chunks[i]!);
  }
  const meta: StateMeta = {
    v: 2,
    enc: encoded.enc,
    modifiedAt,
    updatedAt,
    chunks: chunks.length,
    rawLen: encoded.rawLen,
    payloadLen: encoded.payloadLen,
  };
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
  // Refresh cookie TTL (rolling sessions).
  setCookie(req, res, SESSION_COOKIE, token, { maxAgeSeconds: 60 * 60 * 24 * 30, httpOnly: true });

  if (method === 'GET') {
    try {
      const rec = await getStateRecord(user.id);
      if (!rec) return json(res, 200, { ok: true, record: null });
      return json(res, 200, { ok: true, record: { ...rec.meta, state: rec.state } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'STATE_READ_FAILED';
      return json(res, 500, { ok: false, error: 'STATE_READ_FAILED', message: msg });
    }
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
  const force = body?.force === true;

  const remoteMeta = await getStateMeta(user.id);
  if (!force && remoteMeta && compareIso(remoteMeta.modifiedAt, modifiedAt) > 0) {
    return json(res, 409, { ok: false, error: 'CONFLICT', record: remoteMeta });
  }

  const meta = await putStateRecord(user.id, modifiedAt, state);
  return json(res, 200, { ok: true, record: meta });
}
