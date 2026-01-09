import type { AppState } from '../state/types';

const DB_NAME = 'fraismensuels';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY_STATE_PREFIX = 'state:';
const LS_KEY_STATE_PREFIX = 'fraismensuels.state:';
const KEY_STATE_LEGACY = 'state';
const LS_KEY_STATE_LEGACY = 'fraismensuels.state';

type KVRecord = { key: string; value: unknown; updatedAt: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('indexedDB not available'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open error'));
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    req.onsuccess = () => {
      const rec = req.result as KVRecord | undefined;
      resolve((rec?.value as T) ?? null);
    };
    req.onerror = () => reject(req.error ?? new Error('indexedDB get error'));
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put({ key, value, updatedAt: new Date().toISOString() } satisfies KVRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB set error'));
  });
}

function keyFor(storageKey: string) {
  const safe = storageKey.trim() || 'default';
  return `${KEY_STATE_PREFIX}${safe}`;
}

function lsKeyFor(storageKey: string) {
  const safe = storageKey.trim() || 'default';
  return `${LS_KEY_STATE_PREFIX}${safe}`;
}

export async function loadAppState(storageKey: string): Promise<AppState | null> {
  const idbKey = keyFor(storageKey);
  const lsKey = lsKeyFor(storageKey);
  try {
    const state = await idbGet<AppState>(idbKey);
    if (state) return state;
  } catch {
    // fallthrough to localStorage
  }

  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return null;
    return JSON.parse(raw) as AppState;
  } catch {
    // ignore
  }

  // Legacy fallback (single-user)
  try {
    const legacy = await idbGet<AppState>(KEY_STATE_LEGACY);
    if (legacy) return legacy;
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(LS_KEY_STATE_LEGACY);
    if (!raw) return null;
    return JSON.parse(raw) as AppState;
  } catch {
    return null;
  }
}

export async function saveAppState(storageKey: string, state: AppState): Promise<void> {
  const idbKey = keyFor(storageKey);
  const lsKey = lsKeyFor(storageKey);
  try {
    await idbSet(idbKey, state);
    return;
  } catch {
    // fallthrough to localStorage
  }

  try {
    localStorage.setItem(lsKey, JSON.stringify(state));
  } catch {
    // ignore
  }
}
