import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { loadAppState, saveAppState } from '../lib/storage';
import { cloudGetState, cloudPutState, cloudPutStateForce } from '../lib/authApi';
import { normalizeState } from './normalize';
import { seedState } from './seed';
import { reducer, type Action } from './reducer';
import type { AppState } from './types';

function actionSummary(action: Action): string | null {
  switch (action.type) {
    case 'HYDRATE':
    case 'ENSURE_MONTH':
      return null;
    case 'SET_SALARY':
      return 'Salaire mis à jour';
    case 'ARCHIVE_MONTH':
      return 'Mois archivé';
    case 'UNARCHIVE_MONTH':
      return 'Mois désarchivé';
    case 'TOGGLE_CHARGE_PAID':
      return 'OK mis à jour';
    case 'ADD_CHARGE':
      return 'Charge ajoutée';
    case 'REMOVE_CHARGE':
      return 'Charge supprimée';
    case 'REORDER_CHARGES':
      return 'Ordre mis à jour';
    case 'UPDATE_CHARGE': {
      const patch = action.patch;
      if ('amountCents' in patch) return 'Montant mis à jour';
      if ('dayOfMonth' in patch) return 'Jour mis à jour';
      if ('name' in patch) return 'Libellé mis à jour';
      if ('scope' in patch) return 'Type mis à jour';
      if ('payment' in patch) return 'Paiement mis à jour';
      if ('accountId' in patch) return 'Compte source mis à jour';
      if ('destination' in patch) return 'Destination mise à jour';
      return 'Charge mise à jour';
    }
    case 'UPDATE_ACCOUNT': {
      const patch = action.patch;
      if ('active' in patch) return patch.active ? 'Compte restauré' : 'Compte désactivé';
      if ('kind' in patch) return 'Type de compte mis à jour';
      return 'Compte mis à jour';
    }
    case 'REMOVE_ACCOUNT':
      return 'Compte supprimé';
    case 'ADD_BUDGET':
      return 'Enveloppe ajoutée';
    case 'UPDATE_BUDGET':
      return 'Enveloppe mise à jour';
    case 'REMOVE_BUDGET':
      return 'Enveloppe supprimée';
    case 'ADD_BUDGET_EXPENSE':
      return 'Dépense ajoutée';
    case 'REMOVE_BUDGET_EXPENSE':
      return 'Dépense supprimée';
    default:
      return null;
  }
}

type Store = {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  saving: { status: 'idle' | 'saving' | 'error'; lastSavedAt?: string; lastSavedMessage?: string };
  cloud: { status: 'idle' | 'syncing' | 'error' | 'offline'; lastSyncedAt?: string; lastMessage?: string; syncNow: () => void };
  exportJson: () => string;
  importJson: (raw: string) => void;
  reset: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreContext missing');
  return ctx;
}

function isoKey(iso?: string) {
  return typeof iso === 'string' && iso.length >= 10 ? iso : '0000-01-01T00:00:00.000Z';
}

function compareIso(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function StoreProvider({ children, storageKey }: { children: React.ReactNode; storageKey: string }) {
  const [hydrated, setHydrated] = useState(false);
  const [hydratedFromLocal, setHydratedFromLocal] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [saving, setSaving] = useState<Store['saving']>({ status: 'idle' });
  const [cloudStatus, setCloudStatus] = useState<Store['cloud']['status']>('idle');
  const [cloudLastSyncedAt, setCloudLastSyncedAt] = useState<string | undefined>(undefined);
  const [cloudLastMessage, setCloudLastMessage] = useState<string | undefined>(undefined);
  const [state, baseDispatch] = useReducer(reducer, undefined, () => seedState());
  const stateRef = useRef<AppState>(state);
  const lastPersistedModifiedAt = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const cloudTimer = useRef<number | null>(null);
  const cloudInitDoneRef = useRef(false);
  const cloudInitInFlightRef = useRef(false);
  const lastCloudPushedRef = useRef<string | null>(null);
  const forceNextCloudPushRef = useRef(false);
  const pendingSummaryRef = useRef<{ count: number; last: string } | null>(null);
  const lastEditSummaryRef = useRef<string | null>(null);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const storage = navigator.storage;
    if (!storage || typeof storage.persist !== 'function' || typeof storage.persisted !== 'function') return;

    let cancelled = false;
    (async () => {
      try {
        const already = await storage.persisted();
        if (cancelled || already) return;
        await storage.persist();
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dispatch = useMemo<React.Dispatch<Action>>(() => {
    return (action) => {
      const summary = actionSummary(action);
      if (summary) {
        const cur = pendingSummaryRef.current;
        pendingSummaryRef.current = cur ? { count: cur.count + 1, last: summary } : { count: 1, last: summary };
        lastEditSummaryRef.current = summary;
      }
      baseDispatch(action);
    };
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadAppState(storageKey);
      if (cancelled) return;
      if (loaded) {
        setHydratedFromLocal(true);
        dispatch({ type: 'HYDRATE', state: normalizeState(loaded) });
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const mod = typeof state.modifiedAt === 'string' ? state.modifiedAt : null;
    if (mod && lastPersistedModifiedAt.current === mod) return;

    setSaving((s) => ({ ...s, status: 'saving' }));
    if (saveTimer.current) window.clearTimeout(saveTimer.current);

	    saveTimer.current = window.setTimeout(() => {
	      (async () => {
	        try {
	          await saveAppState(storageKey, stateRef.current);
	          lastPersistedModifiedAt.current = mod ?? stateRef.current.modifiedAt ?? new Date().toISOString();
	          const pending = pendingSummaryRef.current;
	          if (pending) pendingSummaryRef.current = null;
	          const msg = pending
	            ? pending.count === 1
	              ? `Sauvegardé · ${pending.last}`
	              : `Sauvegardé · ${pending.last} (+${pending.count - 1})`
	            : undefined;
	          setSaving({ status: 'idle', lastSavedAt: new Date().toISOString(), lastSavedMessage: msg });
	        } catch {
	          setSaving({ status: 'error' });
	        }
	      })();
	    }, 250);

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [state, hydrated]);

  const runCloudSync = useCallback(async () => {
    if (!isOnline) {
      setCloudStatus('offline');
      setCloudLastMessage('Offline');
      return;
    }

    setCloudStatus('syncing');
    setCloudLastMessage(undefined);

    const local = stateRef.current;
    const remote = await cloudGetState();
    const localMod = isoKey(local.modifiedAt);
    const remoteMod = remote ? isoKey(remote.modifiedAt) : null;

    // Prefer cloud if this device has no local storage yet (fresh install / new device).
    if (remote && (!hydratedFromLocal || compareIso(remoteMod!, localMod) > 0)) {
      dispatch({ type: 'HYDRATE', state: normalizeState(remote.state as AppState) });
      lastCloudPushedRef.current = remoteMod;
      setCloudStatus('idle');
      setCloudLastSyncedAt(new Date().toISOString());
      setCloudLastMessage('Cloud → appareil');
      return;
    }

    // Push only if we have something meaningful locally (modifiedAt exists) or we already had local storage.
    const shouldPush = hydratedFromLocal || typeof local.modifiedAt === 'string';
    if (!remote && shouldPush) {
      const rec = await cloudPutState(local, local.modifiedAt);
      lastCloudPushedRef.current = rec.modifiedAt;
      setCloudStatus('idle');
      setCloudLastSyncedAt(new Date().toISOString());
      setCloudLastMessage('Appareil → cloud');
      return;
    }

    if (remote && compareIso(localMod, remoteMod!) > 0) {
      const rec = await cloudPutState(local, local.modifiedAt);
      lastCloudPushedRef.current = rec.modifiedAt;
      setCloudStatus('idle');
      setCloudLastSyncedAt(new Date().toISOString());
      setCloudLastMessage('Appareil → cloud');
      return;
    }

    setCloudStatus('idle');
    setCloudLastSyncedAt(new Date().toISOString());
    setCloudLastMessage('Déjà à jour');
  }, [dispatch, hydratedFromLocal, isOnline]);

  const syncNow = useCallback(() => {
    void runCloudSync().catch((e) => {
      const msg = e instanceof Error ? e.message : 'Sync impossible';
      setCloudStatus('error');
      setCloudLastSyncedAt(new Date().toISOString());
      setCloudLastMessage(msg);
    });
  }, [runCloudSync]);

  useEffect(() => {
    if (!hydrated) return;
    if (!isOnline) return;
    if (cloudInitDoneRef.current || cloudInitInFlightRef.current) return;
    cloudInitInFlightRef.current = true;
    void runCloudSync()
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Sync impossible';
        setCloudStatus('error');
        setCloudLastSyncedAt(new Date().toISOString());
        setCloudLastMessage(msg);
      })
      .finally(() => {
        cloudInitInFlightRef.current = false;
        cloudInitDoneRef.current = true;
      });
  }, [hydrated, isOnline, runCloudSync]);

  useEffect(() => {
    if (!hydrated) return;
    if (!cloudInitDoneRef.current) return;
    const mod = state.modifiedAt ?? null;
    if (!mod) return;
    if (lastCloudPushedRef.current === mod) return;
    if (!isOnline) {
      setCloudStatus('offline');
      setCloudLastMessage('Offline');
      return;
    }

    if (cloudTimer.current) window.clearTimeout(cloudTimer.current);
    cloudTimer.current = window.setTimeout(() => {
      (async () => {
        try {
          setCloudStatus('syncing');
          const snapshot = stateRef.current;
          const force = forceNextCloudPushRef.current;
          const rec = force ? await cloudPutStateForce(snapshot, mod) : await cloudPutState(snapshot, mod);
          lastCloudPushedRef.current = rec.modifiedAt;
          if (force) forceNextCloudPushRef.current = false;
          setCloudStatus('idle');
          setCloudLastSyncedAt(new Date().toISOString());
          const suffix = lastEditSummaryRef.current ? ` · ${lastEditSummaryRef.current}` : '';
          setCloudLastMessage(`${force ? 'Cloud remplacé' : 'Cloud synchronisé'}${suffix}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Cloud: erreur';
          setCloudStatus('error');
          setCloudLastSyncedAt(new Date().toISOString());
          setCloudLastMessage(msg);
        }
      })();
    }, 800);

    return () => {
      if (cloudTimer.current) window.clearTimeout(cloudTimer.current);
    };
  }, [hydrated, isOnline, state, state.modifiedAt]);

  const cloud = useMemo<Store['cloud']>(() => {
    return { status: cloudStatus, lastSyncedAt: cloudLastSyncedAt, lastMessage: cloudLastMessage, syncNow };
  }, [cloudLastMessage, cloudLastSyncedAt, cloudStatus, syncNow]);

  const store = useMemo<Store>(() => {
    return {
      state,
      dispatch,
      saving,
      cloud,
      exportJson: () => JSON.stringify(state, null, 2),
      importJson: (raw) => {
        const parsed = JSON.parse(raw) as AppState;
        const normalized = normalizeState(parsed);
        const imported = { ...normalized, modifiedAt: new Date().toISOString() } satisfies AppState;
        forceNextCloudPushRef.current = true;
        lastCloudPushedRef.current = null;
        cloudInitDoneRef.current = true;
        dispatch({ type: 'HYDRATE', state: imported });
      },
      reset: () => dispatch({ type: 'HYDRATE', state: seedState() }),
    };
  }, [cloud, dispatch, saving, state]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
