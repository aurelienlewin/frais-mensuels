import { useEffect, useMemo, useRef, useState } from 'react';
import { decryptState, deriveSyncId, encryptState, isSyncCryptoSupported } from '../lib/sync';
import { getRemoteRecord, putRemoteRecord } from '../lib/syncApi';
import { normalizeState } from '../state/normalize';
import type { Action } from '../state/reducer';
import type { AppState } from '../state/types';
import { cx } from './cx';

function compareIso(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function shortIso(iso: string) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  } catch {
    return iso;
  }
}

export function SyncDialog({
  open,
  online,
  state,
  dispatch,
  onClose,
  notify,
}: {
  open: boolean;
  online: boolean;
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onClose: () => void;
  notify: (message: string, tone: 'success' | 'error') => void;
}) {
  const passRef = useRef<HTMLInputElement | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [working, setWorking] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoRaw, setUndoRaw] = useState<string | null>(null);

  const localModifiedAt = state.modifiedAt ?? new Date().toISOString();
  const cryptoOk = isSyncCryptoSupported();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setInfo(null);
    setUndoRaw(null);
    window.setTimeout(() => passRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const summary = useMemo(() => {
    if (!open) return null;
    if (!online) return { tone: 'warn' as const, text: 'Offline: sync indisponible.' };
    if (!cryptoOk) return { tone: 'warn' as const, text: 'WebCrypto indisponible sur ce navigateur.' };
    return { tone: 'ok' as const, text: 'Chiffrement local (AES‑GCM) + stockage Vercel KV.' };
  }, [cryptoOk, online, open]);

  if (!open) return null;

  const canSync = online && cryptoOk && !working && passphrase.trim().length >= 6;

  const runSync = async () => {
    const pass = passphrase.trim();
    if (!pass) return;
    setWorking(true);
    setError(null);
    setInfo(null);

    try {
      if (!online) throw new Error('Offline: impossible de synchroniser.');
      if (!cryptoOk) throw new Error('WebCrypto indisponible sur ce navigateur.');
      const syncId = await deriveSyncId(pass);

      const remote = await getRemoteRecord(syncId);
      if (!remote) {
        const payload = await encryptState(state, pass);
        const rec = await putRemoteRecord(syncId, localModifiedAt, payload);
        setInfo(`Envoyé · cloud: ${shortIso(rec.updatedAt)}`);
        notify('Sync · envoyé', 'success');
        return;
      }

      const cmp = compareIso(remote.modifiedAt, localModifiedAt);
      if (cmp === 0) {
        setInfo(`Déjà à jour · cloud: ${shortIso(remote.updatedAt)}`);
        notify('Sync · déjà à jour', 'success');
        return;
      }

      if (cmp > 0) {
        // Remote newer -> pull (keep an undo backup)
        setUndoRaw(JSON.stringify(state));
        const remoteState = await decryptState(remote.payload, pass);
        dispatch({ type: 'HYDRATE', state: normalizeState(remoteState) });
        setInfo(`Téléchargé · cloud: ${shortIso(remote.updatedAt)}`);
        notify('Sync · téléchargé', 'success');
        return;
      }

      // Local newer -> push
      const payload = await encryptState(state, pass);
      const rec = await putRemoteRecord(syncId, localModifiedAt, payload);
      setInfo(`Envoyé · cloud: ${shortIso(rec.updatedAt)}`);
      notify('Sync · envoyé', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sync impossible';
      setError(msg);
      notify('Sync · erreur', 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Synchronisation"
        className="motion-pop relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-ink-950/92 shadow-[0_20px_120px_-60px_rgba(0,0,0,0.9)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <div className="text-sm text-slate-300">Sync (chiffré)</div>
            <div className="mt-1 text-lg font-semibold tracking-tight text-slate-100">iPhone ↔ Desktop</div>
            <div className="mt-1 text-xs text-slate-400">Mot de passe identique sur chaque appareil. Pas de récupération.</div>
          </div>
          <button
            type="button"
            className="h-9 w-9 rounded-2xl border border-white/10 bg-white/5 text-slate-100 transition-colors hover:bg-white/10"
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {summary ? (
            <div
              className={cx(
                'rounded-2xl border px-4 py-3 text-xs',
                summary.tone === 'warn' ? 'border-amber-200/20 bg-amber-400/10 text-amber-50' : 'border-white/10 bg-white/5 text-slate-200',
              )}
            >
              {summary.text}
            </div>
          ) : null}

          <label className="grid gap-2">
            <div className="text-xs text-slate-400">Passphrase</div>
            <input
              ref={passRef}
              className="h-11 w-full rounded-2xl border border-white/15 bg-white/7 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-200/40 focus:bg-white/10"
              type="password"
              autoComplete="current-password"
              inputMode="text"
              value={passphrase}
              placeholder="Minimum 6 caractères"
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </label>

          <div className="grid gap-2 text-[11px] text-slate-400">
            <div className="flex items-center justify-between gap-3">
              <span>Local (modifié)</span>
              <span className="font-mono text-slate-200">{shortIso(localModifiedAt)}</span>
            </div>
          </div>

          {info ? <div className="text-sm text-emerald-200">{info}</div> : null}
          {error ? <div className="text-sm text-rose-200">{error}</div> : null}

          {undoRaw ? (
            <button
              type="button"
              className="w-full rounded-2xl border border-white/15 bg-white/7 px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/10"
              onClick={() => {
                try {
                  const parsed = JSON.parse(undoRaw) as AppState;
                  dispatch({ type: 'HYDRATE', state: normalizeState(parsed) });
                  setUndoRaw(null);
                  setInfo('État local restauré.');
                  notify('Sync · annulé', 'success');
                } catch {
                  setError('Annulation impossible.');
                  notify('Sync · erreur', 'error');
                }
              }}
            >
              Annuler (restaurer l’état local)
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-5">
          <button
            type="button"
            className="rounded-2xl border border-white/15 bg-white/7 px-4 py-3 text-sm text-slate-200 transition-colors hover:bg-white/10"
            onClick={onClose}
          >
            Fermer
          </button>
          <button
            type="button"
            className={cx(
              'rounded-2xl border border-fuchsia-200/25 bg-fuchsia-400/12 px-5 py-3 text-sm font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/18',
              (!canSync || working) && 'opacity-50 hover:bg-fuchsia-400/12',
            )}
            disabled={!canSync || working}
            onClick={runSync}
          >
            {working ? 'Sync…' : 'Synchroniser'}
          </button>
        </div>
      </div>
    </div>
  );
}

