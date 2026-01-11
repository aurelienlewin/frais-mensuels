import { kvDel, kvExpire, kvGet, kvIncr, kvSet } from './_kv.js';

export const SESSION_COOKIE = 'fm_session';
const PREFIX = 'fm:auth:';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const BufferCtor = (globalThis as any).Buffer as any;

type PasswordHash = {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  saltB64Url: string;
  hashB64Url: string;
};

type RecoveryHash = {
  v: 1;
  alg: 'SHA256';
  hashB64Url: string;
};

export type UserRecordV1 = {
  v: 1;
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  password: PasswordHash;
  recovery: RecoveryHash;
  sessionVersion: number;
};

type SessionRecordV1 = {
  v: 1;
  token: string;
  userId: string;
  sessionVersion: number;
  createdAt: string;
  lastSeenAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

async function sha256Base64Url(input: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return BufferCtor.from(new Uint8Array(digest)).toString('base64url');
}

async function pbkdf2Sha256Base64Url(password: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<string> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, baseKey, 256);
  return BufferCtor.from(new Uint8Array(bits)).toString('base64url');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function passwordPolicy(email: string, password: string): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const pw = password ?? '';
  if (pw.length < 12) reasons.push('12 caractères minimum');
  if (pw.length > 128) reasons.push('128 caractères maximum');
  const lower = /[a-z]/.test(pw);
  const upper = /[A-Z]/.test(pw);
  const digit = /\d/.test(pw);
  const symbol = /[^A-Za-z0-9]/.test(pw);
  const classes = [lower, upper, digit, symbol].filter(Boolean).length;
  if (classes < 3) reasons.push('Au moins 3 types: minuscule, majuscule, chiffre, symbole');

  const emailNorm = normalizeEmail(email);
  const emailUser = emailNorm.split('@')[0] ?? '';
  if (emailUser && pw.toLowerCase().includes(emailUser) && emailUser.length >= 3) {
    reasons.push("Ne doit pas contenir l'email");
  }

  const common = new Set([
    'password',
    'password123',
    '123456',
    '12345678',
    '123456789',
    'qwerty',
    'azerty',
    '111111',
    '000000',
    'letmein',
    'admin',
    'welcome',
  ]);
  if (common.has(pw.trim().toLowerCase())) reasons.push('Mot de passe trop commun');

  return { ok: reasons.length === 0, reasons };
}

export async function createPasswordHash(password: string): Promise<PasswordHash> {
  const iter = 160_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Sha256Base64Url(password, salt, iter);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter, saltB64Url: BufferCtor.from(salt).toString('base64url'), hashB64Url: hash };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  if (!stored || stored.v !== 1 || stored.kdf !== 'PBKDF2-SHA256') return false;
  const salt = BufferCtor.from(stored.saltB64Url, 'base64url');
  const saltBytes = new Uint8Array(salt.buffer, salt.byteOffset, salt.byteLength);
  const derived = await pbkdf2Sha256Base64Url(password, saltBytes, stored.iter);
  return timingSafeEqualStr(derived, stored.hashB64Url);
}

export async function createRecoveryCode(): Promise<{ code: string; hash: RecoveryHash }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const code = BufferCtor.from(bytes).toString('base64url');
  const hashB64Url = await sha256Base64Url(code);
  return { code, hash: { v: 1, alg: 'SHA256', hashB64Url } };
}

export async function verifyRecoveryCode(code: string, stored: RecoveryHash): Promise<boolean> {
  if (!stored || stored.v !== 1 || stored.alg !== 'SHA256') return false;
  const hash = await sha256Base64Url(code);
  return timingSafeEqualStr(hash, stored.hashB64Url);
}

function emailKey(emailNorm: string) {
  return `${PREFIX}email:${emailNorm}`;
}

function userKey(userId: string) {
  return `${PREFIX}user:${userId}`;
}

function sessionKey(token: string) {
  return `${PREFIX}s:${token}`;
}

export async function getUserByEmail(email: string): Promise<UserRecordV1 | null> {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  const userId = await kvGet(emailKey(norm));
  if (!userId) return null;
  return getUserById(userId);
}

export async function getUserById(userId: string): Promise<UserRecordV1 | null> {
  const raw = await kvGet(userKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as UserRecordV1;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function putUser(user: UserRecordV1): Promise<void> {
  await kvSet(userKey(user.id), JSON.stringify(user));
  await kvSet(emailKey(normalizeEmail(user.email)), user.id);
}

export async function emailExists(email: string): Promise<boolean> {
  const norm = normalizeEmail(email);
  if (!norm) return false;
  const id = await kvGet(emailKey(norm));
  return Boolean(id);
}

export async function createUser(email: string, password: string): Promise<{ user: UserRecordV1; recoveryCode: string }> {
  const emailNorm = normalizeEmail(email);
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const passwordHash = await createPasswordHash(password);
  const recovery = await createRecoveryCode();
  const user: UserRecordV1 = {
    v: 1,
    id,
    email: emailNorm,
    createdAt,
    updatedAt: createdAt,
    password: passwordHash,
    recovery: recovery.hash,
    sessionVersion: 1,
  };
  await putUser(user);
  return { user, recoveryCode: recovery.code };
}

export async function createSession(user: UserRecordV1): Promise<string> {
  const token = BufferCtor.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const now = nowIso();
  const sess: SessionRecordV1 = {
    v: 1,
    token,
    userId: user.id,
    sessionVersion: user.sessionVersion,
    createdAt: now,
    lastSeenAt: now,
  };
  await kvSet(sessionKey(token), JSON.stringify(sess));
  await kvExpire(sessionKey(token), SESSION_TTL_SECONDS);
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  await kvDel(sessionKey(token));
}

export async function getSession(token: string): Promise<SessionRecordV1 | null> {
  if (!token) return null;
  const raw = await kvGet(sessionKey(token));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionRecordV1;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function touchSession(token: string): Promise<void> {
  const sess = await getSession(token);
  if (!sess) return;
  const next = { ...sess, lastSeenAt: nowIso() };
  await kvSet(sessionKey(token), JSON.stringify(next));
  await kvExpire(sessionKey(token), SESSION_TTL_SECONDS);
}

export async function rateLimit(prefix: string, ip: string, max: number, windowSeconds: number): Promise<boolean> {
  const key = `fm:rl:${prefix}:${ip}`;
  const n = await kvIncr(key);
  if (n === 1) await kvExpire(key, windowSeconds);
  return n <= max;
}
