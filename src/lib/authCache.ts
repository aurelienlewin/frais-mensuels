import type { AuthUser } from './authApi';

type CachedAuthV1 = {
  v: 1;
  user: AuthUser;
  savedAt: string;
};

const STORAGE_KEY = 'fm:auth:user:v1';

export function readCachedUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAuthV1>;
    if (!parsed || parsed.v !== 1) return null;
    const u = parsed.user as Partial<AuthUser> | undefined;
    if (!u || typeof u.id !== 'string' || !u.id) return null;
    if (typeof u.email !== 'string' || !u.email) return null;
    return { id: u.id, email: u.email };
  } catch {
    return null;
  }
}

export function writeCachedUser(user: AuthUser): void {
  try {
    const rec: CachedAuthV1 = { v: 1, user: { id: user.id, email: user.email }, savedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch {
    // ignore (private mode / quota)
  }
}

export function clearCachedUser(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

