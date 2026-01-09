import { useEffect, useMemo, useRef, useState } from 'react';
import { monthLabelFr, monthLabelShortFr, ymAdd, ymFromDate, type YM } from '../lib/date';
import { useStore } from '../state/store';
import { ChargesTable } from './ChargesTable';
import { BudgetsPanel } from './BudgetsPanel';
import { SummaryPanel } from './SummaryPanel';
import { QuickAddWidget } from './QuickAddWidget';
import { cx } from './cx';

export function AppView({ initialYm }: { initialYm: YM }) {
  const { saving, state, dispatch, exportJson, importJson, reset } = useStore();
  const [ym, setYm] = useState<YM>(initialYm);
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [toast, setToast] = useState<{ id: string; message: string; tone: 'success' | 'error' } | null>(null);
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const monthButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const toastTimerRef = useRef<number | null>(null);
  const lastSaveAtRef = useRef<string | undefined>(undefined);
  const lastErrorStatusRef = useRef<boolean>(false);

  const archived = state.months[ym]?.archived ?? false;
  const todayYm = useMemo(() => ymFromDate(new Date()), []);
  const statusText =
    saving.status === 'saving'
      ? 'Sauvegarde en cours.'
      : saving.status === 'error'
        ? 'Erreur de sauvegarde.'
        : saving.lastSavedMessage ?? 'Sauvegarde terminée.';

  const visibleMonths = useMemo(() => {
    const base = todayYm;
    const months = Array.from({ length: 7 }, (_, i) => ymAdd(base, i - 3));
    if (!months.includes(ym)) return [ym, ...months];
    return months;
  }, [todayYm, ym]);

  const archivedMonths = useMemo(() => {
    return Object.keys(state.months)
      .filter((k) => state.months[k as YM]?.archived)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) as YM[];
  }, [state.months]);

  useEffect(() => {
    dispatch({ type: 'ENSURE_MONTH', ym });
  }, [dispatch, ym]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (message: string, tone: 'success' | 'error') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToast({ id, message, tone });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800);
  };

  useEffect(() => {
    const lastSavedAt = saving.lastSavedAt;
    if (saving.status !== 'idle' || !lastSavedAt) return;
    if (lastSaveAtRef.current === lastSavedAt) return;
    lastSaveAtRef.current = lastSavedAt;
    if (!saving.lastSavedMessage) return;
    showToast(saving.lastSavedMessage, 'success');
  }, [saving.status, saving.lastSavedAt, saving.lastSavedMessage]);

  useEffect(() => {
    const isError = saving.status === 'error';
    if (isError && !lastErrorStatusRef.current) {
      showToast('Erreur de sauvegarde', 'error');
    }
    lastErrorStatusRef.current = isError;
  }, [saving.status]);

  return (
    <div className="min-h-dvh">
      {toast ? (
        <div className="pointer-events-none fixed left-1/2 top-16 z-[60] w-full -translate-x-1/2 px-4">
          <div
            key={toast.id}
            className={cx(
              'motion-pop mx-auto w-fit rounded-2xl border bg-ink-950/95 px-4 py-2 text-[12px] font-semibold shadow-[0_20px_80px_-40px_rgba(0,0,0,0.95)]',
              toast.tone === 'error'
                ? 'border-rose-200/35 text-rose-50'
                : 'border-emerald-200/35 text-emerald-50',
            )}
            aria-hidden="true"
          >
            {toast.message}
          </div>
        </div>
      ) : null}
      <a
        href="#main"
        className="sr-only rounded-xl border border-white/20 bg-ink-950/95 px-4 py-2 text-sm text-slate-100 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.9)] focus:not-sr-only focus:fixed focus:left-6 focus:top-6 focus:z-[60]"
        onClick={() => {
          window.setTimeout(() => (document.getElementById('main') as HTMLElement | null)?.focus(), 0);
        }}
      >
        Aller au contenu
      </a>
      <header className="sticky top-0 z-10 border-b border-white/15 bg-ink-950/95">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="sr-only" aria-live="polite">
            {statusText} {!online ? 'Mode hors ligne.' : ''} {archived ? 'Mois archivé.' : ''}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <h1 className="text-base font-semibold tracking-tight">Frais mensuels</h1>
              <div className="h-4 min-w-[120px] text-xs text-slate-400" aria-hidden="true">
                {saving.status === 'saving' ? 'Sauvegarde…' : saving.status === 'error' ? 'Sauvegarde en erreur' : ''}
              </div>
              {!online ? <div className="rounded-full bg-rose-400/10 px-3 py-1 text-xs text-rose-200">Offline</div> : null}
              {archived ? <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">Archivé</div> : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                className="rounded-xl border border-white/15 bg-white/7 px-3 py-2 text-sm transition-colors hover:bg-white/10"
                onClick={() => setYm(todayYm)}
                type="button"
              >
                Aujourd’hui
              </button>

              <button
                className="rounded-xl border border-white/15 bg-white/7 px-3 py-2 text-sm transition-colors hover:bg-white/10"
                onClick={() => setYm((v) => ymAdd(v, -1))}
                aria-label="Mois précédent"
                type="button"
              >
                ←
              </button>
              <button
                className="rounded-xl border border-white/15 bg-white/7 px-3 py-2 text-sm transition-colors hover:bg-white/10"
                onClick={() => setYm((v) => ymAdd(v, 1))}
                aria-label="Mois suivant"
                type="button"
              >
                →
              </button>

              <select
                className={cx(
                  'h-10 rounded-xl border border-white/15 bg-white/7 px-3 text-sm text-slate-100 outline-none transition-colors hover:bg-white/10',
                  archivedMonths.length === 0 && 'opacity-50',
                )}
                defaultValue=""
                disabled={archivedMonths.length === 0}
                onChange={(e) => {
                  const next = e.target.value as YM;
                  if (next) setYm(next);
                  e.target.value = '';
                }}
                aria-label="Historique (mois archivés)"
              >
                <option value="" disabled>
                  Historique…
                </option>
                {archivedMonths.map((m) => (
                  <option key={m} value={m}>
                    {monthLabelFr(m)}
                  </option>
                ))}
	              </select>

              <details
                ref={menuRef}
                className="relative"
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return;
                  menuRef.current?.removeAttribute('open');
                  (menuRef.current?.querySelector('summary') as HTMLElement | null)?.focus();
                }}
              >
                <summary
                  aria-label="Menu"
                  className="list-none rounded-xl border border-white/15 bg-white/7 px-3 py-2 text-sm transition-colors hover:bg-white/10"
                >
                  ⋯
                </summary>
                <div className="absolute right-0 mt-2 w-[260px] rounded-2xl border border-white/15 bg-ink-950/95 p-2 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.9)]">
                  <button
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
                    onClick={() => {
                      const json = exportJson();
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `fraismensuels-${ym}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      menuRef.current?.removeAttribute('open');
                    }}
                    type="button"
                  >
                    Exporter (JSON)
                  </button>

                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
                    onClick={() => importInputRef.current?.click()}
                  >
                    Importer (JSON)
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const raw = await file.text();
                        importJson(raw);
                      } catch {
                        window.alert('Import impossible: JSON invalide.');
                      } finally {
                        e.target.value = '';
                        menuRef.current?.removeAttribute('open');
                      }
                    }}
                  />

                  <button
                    className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-rose-200 hover:bg-rose-400/10"
                    onClick={() => {
                      const ok = window.confirm("Réinitialiser l'app (données d'exemple) ?");
                      if (!ok) return;
                      reset();
                      menuRef.current?.removeAttribute('open');
                    }}
                    type="button"
                  >
                    Réinitialiser (exemple)
                  </button>
                </div>
              </details>

              <button
                className="ml-2 rounded-xl border border-white/15 bg-white/7 px-3 py-2 text-sm transition-colors hover:bg-white/10"
                onClick={() => {
                  if (!archived) {
                    const ok = window.confirm('Archiver ce mois ? Les montants seront figés (modifiable en réouvrant).');
                    if (!ok) return;
                    dispatch({ type: 'ARCHIVE_MONTH', ym });
                    return;
                  }
                  const ok = window.confirm('Réouvrir ce mois (désarchiver) ?');
                  if (!ok) return;
                  dispatch({ type: 'UNARCHIVE_MONTH', ym });
                }}
                type="button"
              >
                {archived ? 'Réouvrir' : 'Archiver'}
              </button>
            </div>
          </div>

          <nav className="mt-4 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Navigation par mois">
            {visibleMonths.map((m) => {
              const selected = m === ym;
              const isArchived = state.months[m]?.archived ?? false;
              const idx = visibleMonths.indexOf(m);
              return (
                <button
                  key={m}
                  ref={(el) => {
                    monthButtonRefs.current[m] = el;
                  }}
                  className={[
                    'flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm capitalize transition',
                    selected ? 'border-white/30 bg-white/12 text-slate-100' : 'border-white/15 bg-white/7 text-slate-200 hover:bg-white/10',
                  ].join(' ')}
                  onClick={() => setYm(m)}
                  aria-current={selected ? 'page' : undefined}
                  type="button"
                  onKeyDown={(e) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                    e.preventDefault();
                    const currentIdx = idx;
                    const nextIdx =
                      e.key === 'ArrowLeft'
                        ? Math.max(0, currentIdx - 1)
                        : e.key === 'ArrowRight'
                          ? Math.min(visibleMonths.length - 1, currentIdx + 1)
                          : e.key === 'Home'
                            ? 0
                            : visibleMonths.length - 1;
                    const nextYm = visibleMonths[nextIdx]!;
                    monthButtonRefs.current[nextYm]?.focus();
                    if (nextYm !== ym) setYm(nextYm);
                  }}
                >
                  {monthLabelShortFr(m)}
                  {isArchived ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" aria-hidden="true" />
                      <span className="sr-only"> (archivé)</span>
                    </>
                  ) : null}
                </button>
              );
            })}
          </nav>
          <div className="text-xs text-slate-500">Fenêtre: 3 mois avant / 3 mois après (et le mois sélectionné s’il est hors fenêtre).</div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-6 pt-10 pb-28 sm:pb-10">
        <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
          <SummaryPanel ym={ym} />
          <div className="space-y-6">
            <ChargesTable ym={ym} archived={archived} />
            <BudgetsPanel ym={ym} archived={archived} />
          </div>
        </div>
      </main>

      <QuickAddWidget ym={ym} archived={archived} />
    </div>
  );
}
