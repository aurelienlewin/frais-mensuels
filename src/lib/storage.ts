import type { AppState } from '../state/types';

const DB_NAME = 'fraismensuels';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY_STATE = 'state';
const LS_KEY_STATE = 'fraismensuels.state';

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

export async function loadAppState(): Promise<AppState | null> {
  try {
    const state = await idbGet<AppState>(KEY_STATE);
    if (state) return state;
  } catch {
    // fallthrough to localStorage
  }

  try {
    const raw = localStorage.getItem(LS_KEY_STATE);
    if (!raw) return null;
    return JSON.parse(raw) as AppState;
  } catch {
    return null;
  }
}

export async function saveAppState(state: AppState): Promise<void> {
  try {
    await idbSet(KEY_STATE, state);
    return;
  } catch {
    // fallthrough to localStorage
  }

  try {
    localStorage.setItem(LS_KEY_STATE, JSON.stringify(state));
  } catch {
    // ignore
  }
}

