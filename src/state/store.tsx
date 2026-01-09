import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { loadAppState, saveAppState } from '../lib/storage';
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

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState<Store['saving']>({ status: 'idle' });
  const [state, baseDispatch] = useReducer(reducer, undefined, () => seedState());
  const lastPersisted = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pendingSummaryRef = useRef<{ count: number; last: string } | null>(null);

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
      }
      baseDispatch(action);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadAppState();
      if (cancelled) return;
      if (loaded) dispatch({ type: 'HYDRATE', state: normalizeState(loaded) });
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const raw = JSON.stringify(state);
    if (raw === lastPersisted.current) return;

    setSaving((s) => ({ ...s, status: 'saving' }));
    if (saveTimer.current) window.clearTimeout(saveTimer.current);

	    saveTimer.current = window.setTimeout(() => {
	      (async () => {
	        try {
	          await saveAppState(state);
	          lastPersisted.current = raw;
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

  const store = useMemo<Store>(() => {
    return {
      state,
      dispatch,
      saving,
      exportJson: () => JSON.stringify(state, null, 2),
      importJson: (raw) => {
        const parsed = JSON.parse(raw) as AppState;
        dispatch({ type: 'HYDRATE', state: normalizeState(parsed) });
      },
      reset: () => dispatch({ type: 'HYDRATE', state: seedState() }),
    };
  }, [state, saving]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
