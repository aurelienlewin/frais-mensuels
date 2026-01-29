import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { monthLabelFr, monthLabelShortFr, ymAdd, ymFromDate, type YM } from '../lib/date';
import { useStore } from '../state/store';
import { ChargesTable } from './ChargesTable';
import { BudgetsPanel } from './BudgetsPanel';
import { SummaryPanel } from './SummaryPanel';
import { QuickAddWidget } from './QuickAddWidget';
import { Tour, type TourStep } from './Tour';
import { AccountsSetupPrompt, EssentialBudgetsSetupPrompt } from './OnboardingSetup';
import { cx } from './cx';
import type { AuthUser } from '../lib/authApi';
import { kickDynamicBackground } from '../lib/backgroundClient';

export function AppView({
  initialYm,
  user,
  sessionUnverified,
  onLogout,
}: {
  initialYm: YM;
  user: AuthUser;
  sessionUnverified: boolean;
  onLogout: () => void | Promise<void>;
}) {
  const { saving, state, dispatch, exportJson, importJson, reset, cloud } = useStore();
  const [ym, setYm] = useState<YM>(initialYm);
  const [monthsNavOpen, setMonthsNavOpen] = useState(false);
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [toast, setToast] = useState<{ id: string; message: string; tone: 'success' | 'error' } | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const monthButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const toastTimerRef = useRef<number | null>(null);
  const lastSaveAtRef = useRef<string | undefined>(undefined);
  const lastCloudAtRef = useRef<string | undefined>(undefined);
  const lastErrorStatusRef = useRef<boolean>(false);

  const tourSteps = useMemo<TourStep[]>(() => {
    const Example = ({ children }: { children: ReactNode }) => (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-200">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Exemple</div>
        <div className="mt-1 font-mono text-[12px] text-slate-100">{children}</div>
      </div>
    );

    return [
      {
        id: 'welcome',
        title: 'Bienvenue',
        body: (
          <>
            <p>
              Cette app fonctionne comme un mini-tableur pour suivre tes charges mensuelles (perso + commun) et tes enveloppes.
            </p>
            <Example>Loyer · 1200€ · J05 · Commun · Auto · OK se coche après échéance</Example>
            <p className="text-xs text-slate-400">
              Le guide ne s’affiche qu’une fois (tu peux le relancer via le menu <span className="font-mono">⋯</span>).
            </p>
          </>
        ),
      },
      {
        id: 'setup-accounts',
        title: 'Configurer tes comptes',
        anchor: 'charges',
        body: (
          <>
            <p>Avant de saisir tes charges, crée/ajuste tes comptes (provenance/destination).</p>
            <AccountsSetupPrompt />
            <p className="text-xs text-slate-400">Tu pourras ensuite les gérer depuis Résumé → Comptes.</p>
          </>
        ),
      },
      {
        id: 'charges',
        title: 'Charges mensuelles',
        anchor: 'charges',
        body: (
          <>
            <p>
              Chaque ligne est une charge récurrente du mois. Tu peux éditer le libellé, le jour, le montant, le type
              (perso/commun), l’auto/manuel, et la provenance/destination.
            </p>
            <Example>Internet · 35.99€ · J12 · Commun (50/50) · Auto · JOINT_MAIN</Example>
            <p className="text-xs text-slate-400">
              Tip: coche <span className="font-mono">OK</span> quand c’est prélevé (auto se coche par défaut si la date est
              passée).
            </p>
          </>
        ),
      },
      {
        id: 'add',
        title: 'Ajouter une charge',
        anchor: 'add-charge',
        body: (
          <>
            <p>
              Clique <span className="font-mono">+ Ajouter</span>, puis complète la ligne. Les modifications sont
              instantanées et sauvegardées.
            </p>
            <Example>Assurance auto · 48€ · J03 · Perso · Auto · PERSONAL_MAIN</Example>
            <p className="text-xs text-slate-400">
              Tu peux réordonner les lignes via drag & drop (ou les flèches sur mobile).
            </p>
          </>
        ),
      },
      {
        id: 'setup-budgets',
        title: 'Créer tes enveloppes',
        anchor: 'budgets',
        body: (
          <>
            <p>Pour l’ajout rapide (perso + essence), crée au moins 2 enveloppes et fixe un montant.</p>
            <EssentialBudgetsSetupPrompt />
          </>
        ),
      },
      {
        id: 'budgets',
        title: 'Enveloppes (budgets)',
        anchor: 'budgets',
        body: (
          <>
            <p>Une enveloppe te donne un montant réservé (ex: perso, essence) et un suivi des dépenses du mois.</p>
            <Example>Budget perso · 200€ → resto 12€ / pharmacie 6€ → reste 182€</Example>
            <p className="text-xs text-slate-400">Les dépenses sont enregistrées en positif (affichées en -€).</p>
          </>
        ),
      },
      {
        id: 'quick-add',
        title: 'Ajout rapide (mobile/desktop)',
        anchor: 'quick-add',
        body: (
          <>
            <p>
              Utilise le widget d’ajout rapide pour saisir une dépense perso ou un plein d’essence en 2 champs.
            </p>
            <Example>⛽ Essence · 55€ (ajouté automatiquement à l’enveloppe)</Example>
            <p className="text-xs text-slate-400">
              Si aucun budget “perso/essence” n’est détecté, l’app te demandera de choisir une enveloppe cible.
            </p>
          </>
        ),
      },
      {
        id: 'summary',
        title: 'Résumé & reste à vivre',
        anchor: 'summary',
        body: (
          <>
            <p>La colonne Résumé agrège tout: charges (commun/perso), enveloppes, reste à vivre, et répartitions.</p>
            <Example>Salaire 3000€ − charges (pour moi) − enveloppes = reste à vivre</Example>
            <p className="text-xs text-slate-400">Tu peux aussi gérer tes comptes (activer/supprimer) depuis le résumé.</p>
          </>
        ),
      },
      {
        id: 'sync',
        title: 'Synchronisation multi-appareils',
        anchor: 'menu',
        body: (
          <>
            <p>
              Les données sont sauvegardées sur l’appareil et synchronisées dans le cloud quand tu es en ligne.
            </p>
            <Example>Menu ⋯ → “Synchroniser (cloud)” → mêmes données sur iOS + desktop</Example>
            <p className="text-xs text-slate-400">
              Tu peux aussi exporter/importer un JSON depuis le menu pour une sauvegarde manuelle.
            </p>
          </>
        ),
      },
    ];
  }, []);

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

  const monthHasData = (m: YM) => {
    const md = state.months[m];
    if (!md) return false;
    if (md.archived) return true;
    if (Object.keys(md.charges).length > 0) return true;
    if (Object.keys(md.budgets).length > 0) return true;
    return false;
  };
  const isMonthDisabled = (m: YM) => {
    if (m === ym) return false;
    const isPast = m < todayYm;
    return isPast && !monthHasData(m);
  };

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
    const durationMs = tone === 'error' ? 3600 : 1800;
    toastTimerRef.current = window.setTimeout(() => setToast(null), durationMs);
  };

  useEffect(() => {
    const lastSavedAt = saving.lastSavedAt;
    if (saving.status !== 'idle' || !lastSavedAt) return;
    if (lastSaveAtRef.current === lastSavedAt) return;
    lastSaveAtRef.current = lastSavedAt;
    if (!saving.lastSavedMessage) return;
    // Prefer cloud toasts when online + idle (auto-sync). Keep local toasts when offline / cloud not OK.
    if (online && cloud.status === 'idle') return;
    showToast(saving.lastSavedMessage, 'success');
  }, [cloud.status, online, saving.status, saving.lastSavedAt, saving.lastSavedMessage]);

  useEffect(() => {
    const isError = saving.status === 'error';
    if (isError && !lastErrorStatusRef.current) {
      showToast('Erreur de sauvegarde', 'error');
    }
    lastErrorStatusRef.current = isError;
  }, [saving.status]);

  useEffect(() => {
    const at = cloud.lastSyncedAt;
    if (!at) return;
    if (lastCloudAtRef.current === at) return;
    lastCloudAtRef.current = at;
    if (!cloud.lastMessage) return;
    const tone = cloud.status === 'error' ? 'error' : 'success';
    showToast(cloud.lastMessage, tone);
  }, [cloud.lastMessage, cloud.lastSyncedAt, cloud.status]);

  useEffect(() => {
    if (state.ui?.tourDismissed) return;
    if (tourOpen) return;
    const t = window.setTimeout(() => {
      if (state.ui?.tourDismissed) return;
      setTourOpen(true);
    }, 350);
    return () => window.clearTimeout(t);
  }, [state.ui?.tourDismissed, tourOpen]);

  return (
    <div className="min-h-dvh">
      <Tour
        open={tourOpen}
        steps={tourSteps}
        onDismiss={() => {
          setTourOpen(false);
          dispatch({ type: 'SET_UI', patch: { tourDismissed: true } });
        }}
      />
      {toast ? (
        <div className="pointer-events-none fixed left-1/2 top-16 z-[60] w-full -translate-x-1/2 px-4">
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
            className={cx(
              'motion-pop mx-auto w-fit rounded-2xl border bg-ink-950/95 px-4 py-2 text-[12px] font-semibold shadow-[0_20px_80px_-40px_rgba(0,0,0,0.95)]',
              toast.tone === 'error'
                ? 'border-rose-200/35 text-rose-50'
                : 'border-emerald-200/35 text-emerald-50',
            )}
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
	      <header
          data-app-header="1"
          className="sticky top-0 z-30 border-b border-white/15 bg-ink-950/95 pt-[env(safe-area-inset-top)]"
        >
        <div className="relative mx-auto max-w-6xl py-2 max-[360px]:py-1.5 pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] max-[360px]:pl-[calc(0.75rem_+_env(safe-area-inset-left))] max-[360px]:pr-[calc(0.75rem_+_env(safe-area-inset-right))] sm:py-4 sm:pl-[calc(1.5rem_+_env(safe-area-inset-left))] sm:pr-[calc(1.5rem_+_env(safe-area-inset-right))]">
          <div className="sr-only" aria-live="polite">
            {statusText} {!online ? 'Mode hors ligne.' : ''} {archived ? 'Mois archivé.' : ''}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3">
              <div className="group relative flex min-w-0 items-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-2 py-1.5 shadow-[0_12px_55px_-28px_rgba(0,0,0,0.85)] max-[520px]:shrink sm:gap-3 sm:px-3 sm:py-2">
                <div className="relative">
                  <div
                    className="pointer-events-none absolute -inset-4 -z-10 bg-[conic-gradient(at_30%_30%,rgba(16,185,129,0.35),rgba(56,189,248,0.4),rgba(236,72,153,0.4),rgba(16,185,129,0.35))] opacity-60 blur-[14px] transition duration-700 group-hover:scale-110 group-hover:opacity-90 sm:opacity-80 sm:blur-2xl"
                    aria-hidden="true"
                  />
                  <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl bg-ink-950 ring-1 ring-white/12 sm:h-12 sm:w-12 sm:ring-white/15">
                    <div className="absolute inset-px rounded-[14px] bg-gradient-to-br from-white/10 via-white/5 to-white/0" />
                    <svg
                      className="relative h-7 w-7 text-white drop-shadow-[0_12px_34px_rgba(0,0,0,0.45)] sm:h-9 sm:w-9"
                      viewBox="0 0 64 64"
                      fill="none"
                      role="img"
                      aria-label="Frais mensuels"
                    >
                      <defs>
                        <linearGradient id="fm-a" x1="12" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#67e8f9" />
                          <stop offset="0.4" stopColor="#c084fc" />
                          <stop offset="1" stopColor="#fbbf24" />
                        </linearGradient>
                        <linearGradient id="fm-b" x1="24" y1="12" x2="52" y2="42" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#34d399" />
                          <stop offset="1" stopColor="#60a5fa" stopOpacity="0.95" />
                        </linearGradient>
                      </defs>
                      <rect x="8" y="8" width="48" height="48" rx="14" fill="url(#fm-a)" opacity="0.2" />
                      <path
                        d="M20 14.5c0-2.485 2.015-4.5 4.5-4.5H42c2.761 0 5 2.239 5 5s-2.239 5-5 5H30v8h10.5c2.761 0 5 2.239 5 5s-2.239 5-5 5H30v11.5c0 2.485-2.015 4.5-4.5 4.5s-4.5-2.015-4.5-4.5V14.5Z"
                        fill="url(#fm-a)"
                      />
                      <path
                        d="M32.5 26.5H43c3.59 0 6.5 2.91 6.5 6.5s-2.91 6.5-6.5 6.5H33.5a3.5 3.5 0 0 1-3.5-3.5V30a3.5 3.5 0 0 1 2.97-3.465c.34-.06.68-.035 1.03-.035Z"
                        fill="url(#fm-b)"
                        opacity="0.92"
                      />
                      <path
                        d="M27.25 15.5h14.5c1.38 0 2.5 1.12 2.5 2.5s-1.12 2.5-2.5 2.5h-9.25c-3.5 0-5.25 1.7-5.25 4.7"
                        stroke="#e2e8f0"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.65"
                      />
                    </svg>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400 sm:text-[11px] sm:tracking-[0.32em]">Tableau privé</div>
                  <div className="flex flex-wrap items-baseline gap-1 sm:gap-2">
                    <h1 className="text-[15px] font-semibold leading-tight tracking-tight text-slate-50 sm:text-lg">
                      <span className="bg-gradient-to-r from-cyan-200 via-slate-200 to-amber-200 bg-clip-text text-transparent">Frais</span>{' '}
                      mensuels
                    </h1>
                    <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/90 shadow-[0_10px_28px_-18px_rgba(16,185,129,0.9)] max-[520px]:hidden sm:inline-flex sm:px-2.5 sm:py-1 sm:text-[11px] sm:tracking-[0.18em]">
                      Actif
                    </span>
                  </div>
                  <p className="hidden text-[11px] text-slate-400 max-[520px]:hidden sm:block sm:text-xs">Synthèse perso + coloc · Cloud + hors ligne</p>
                </div>
              </div>
              <div className="h-4 min-w-[120px] text-xs text-slate-400 max-[360px]:hidden" aria-hidden="true">
                {saving.status === 'saving' ? 'Sauvegarde…' : saving.status === 'error' ? 'Sauvegarde en erreur' : ''}
              </div>
              {!online ? <div className="rounded-full bg-rose-400/10 px-3 py-1 text-xs text-rose-200">Offline</div> : null}
              {archived ? <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">Archivé</div> : null}
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 max-[360px]:w-full sm:gap-2">
              <div className="flex min-w-0 items-center gap-1.5 truncate sm:hidden">
                <div className="min-w-0 truncate text-xs font-semibold text-slate-200">{monthLabelFr(ym)}</div>
                <button
                  type="button"
                  className="flex flex-none items-center gap-1.5 rounded-full border border-white/15 bg-white/7 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10"
                  onClick={() => setMonthsNavOpen((v) => !v)}
                  aria-expanded={monthsNavOpen}
                  aria-controls="month-nav"
                >
                  <span>{monthsNavOpen ? 'Masquer' : 'Mois'}</span>
                  <span aria-hidden="true" className="text-[11px]">
                    {monthsNavOpen ? '▴' : '▾'}
                  </span>
                </button>
              </div>
              <button
                className="rounded-xl border border-white/15 bg-white/7 px-3 py-2 text-sm transition-colors hover:bg-white/10 max-[360px]:px-2 max-[360px]:py-1.5 max-[360px]:text-xs"
                onClick={() => setYm(todayYm)}
                type="button"
              >
                <span className="max-[360px]:hidden">Aujourd’hui</span>
                <span className="hidden max-[360px]:inline">Ajd</span>
              </button>

              {(() => {
                const prevYm = ymAdd(ym, -1);
                const disabled = isMonthDisabled(prevYm);
                return (
              <button
                className={cx(
                  'rounded-xl border border-white/15 bg-white/7 px-3 py-2 text-sm transition-colors max-[360px]:px-2 max-[360px]:py-1.5 max-[360px]:text-xs',
                  disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/10',
                )}
                onClick={() => setYm(prevYm)}
                aria-label="Mois précédent"
                type="button"
                disabled={disabled}
                title={disabled ? 'Aucune donnée pour ce mois.' : undefined}
              >
                ←
              </button>
                );
              })()}
              <button
                className="rounded-xl border border-white/15 bg-white/7 px-3 py-2 text-sm transition-colors hover:bg-white/10 max-[360px]:px-2 max-[360px]:py-1.5 max-[360px]:text-xs"
                onClick={() => setYm((v) => ymAdd(v, 1))}
                aria-label="Mois suivant"
                type="button"
              >
                →
              </button>

              <select
                className={cx(
                  'h-10 rounded-xl border border-white/15 bg-white/7 px-3 text-sm text-slate-100 outline-none transition-colors hover:bg-white/10 max-[360px]:h-9 max-[360px]:px-2 max-[360px]:text-xs',
                  archivedMonths.length === 0 && 'opacity-50',
                  'hidden sm:block',
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
                className="absolute right-[calc(0.75rem_+_env(safe-area-inset-right))] top-2 flex-shrink-0 sm:relative sm:right-auto sm:top-auto"
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return;
                  menuRef.current?.removeAttribute('open');
                  (menuRef.current?.querySelector('summary') as HTMLElement | null)?.focus();
                }}
              >
                <summary
                  aria-label="Menu"
                  className="list-none rounded-xl border border-white/15 bg-white/7 px-3 py-2 text-sm transition-colors hover:bg-white/10 max-[360px]:px-2 max-[360px]:py-1.5 max-[360px]:text-xs inline-flex items-center justify-center"
                  data-tour="menu"
                >
                  <svg
                    viewBox="0 0 24 24"
                    role="img"
                    aria-hidden="true"
                    className="h-5 w-5 text-slate-100"
                  >
                    <path
                      d="M4 7.5h16M4 12h16M4 16.5h16"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
	                </summary>
                <div
                  className="absolute right-0 z-20 mt-2 w-[min(320px,calc(100vw-1.5rem))] rounded-2xl border border-white/15 bg-ink-950/95 p-2 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.9)] sm:left-auto sm:right-0 sm:translate-x-0 sm:w-[280px]"
                  style={{ maxWidth: 'calc(100vw - 1.5rem - env(safe-area-inset-right))' }}
                >
		                  <div className="px-3 py-2 text-xs text-slate-400">
		                    Connecté: <span className="font-mono text-slate-200">{user.email}</span>
		                  </div>
                      {sessionUnverified ? (
                        <div className="px-3 pb-2 text-[11px] text-amber-200">
                          Session locale (non vérifiée). Reconnexion automatique dès que possible.
                        </div>
                      ) : null}

		                  <button
		                    className={cx(
		                      'w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10',
		                      (!online || cloud.status === 'syncing') && 'opacity-50 hover:bg-transparent',
		                    )}
		                    disabled={!online || cloud.status === 'syncing'}
		                    onClick={() => {
		                      cloud.syncNow();
		                      menuRef.current?.removeAttribute('open');
		                    }}
		                    type="button"
		                  >
		                    Synchroniser (cloud){cloud.status === 'syncing' ? '…' : ''}
		                  </button>

		                  <button
		                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
		                    onClick={() => {
		                      setTourOpen(true);
		                      menuRef.current?.removeAttribute('open');
		                    }}
		                    type="button"
		                  >
		                    Guide (tour)
		                  </button>

                      <button
                        className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
                        onClick={() => {
                          void kickDynamicBackground({ force: true });
                          showToast('Fond mis à jour', 'success');
                          menuRef.current?.removeAttribute('open');
                        }}
                        type="button"
                      >
                        Nouveau fond (random)
                      </button>

                      <div className="block px-3 pb-2 pt-1 text-[11px] text-slate-400 sm:hidden">
                        <div className="font-semibold uppercase tracking-wide text-slate-500">Actions</div>
                      </div>

                      <button
                        className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10 sm:hidden"
                        onClick={() => {
                          if (!archived) {
                            const ok = window.confirm('Archiver ce mois ? Les montants seront figés (modifiable en réouvrant).');
                            if (!ok) return;
                            dispatch({ type: 'ARCHIVE_MONTH', ym });
                          } else {
                            const ok = window.confirm('Réouvrir ce mois (désarchiver) ?');
                            if (!ok) return;
                            dispatch({ type: 'UNARCHIVE_MONTH', ym });
                          }
                          menuRef.current?.removeAttribute('open');
                        }}
                        type="button"
                      >
                        {archived ? 'Réouvrir le mois' : 'Archiver le mois'}
                      </button>

                      <div className="px-3 pb-2 pt-2 text-[11px] text-slate-400 sm:hidden">
                        <div className="font-semibold uppercase tracking-wide text-slate-500">Historique</div>
                      </div>
                      <div className="px-3 pb-2 sm:hidden">
                        <select
                          className={cx(
                            'h-10 w-full rounded-xl border border-white/15 bg-white/7 px-3 text-sm text-slate-100 outline-none transition-colors hover:bg-white/10',
                            archivedMonths.length === 0 && 'opacity-60 hover:bg-white/7',
                          )}
                          defaultValue=""
                          disabled={archivedMonths.length === 0}
                          onChange={(e) => {
                            const next = e.target.value as YM;
                            if (next) setYm(next);
                            e.target.value = '';
                            menuRef.current?.removeAttribute('open');
                          }}
                          aria-label="Historique (mois archivés)"
                        >
                          <option value="" disabled>
                            {archivedMonths.length === 0 ? 'Aucun mois archivé' : 'Choisir…'}
                          </option>
                          {archivedMonths.map((m) => (
                            <option key={m} value={m}>
                              {monthLabelFr(m)}
                            </option>
                          ))}
                        </select>
                      </div>

		                  <button
		                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-rose-200 hover:bg-rose-400/10"
		                    onClick={async () => {
		                      await onLogout();
		                      menuRef.current?.removeAttribute('open');
		                    }}
		                    type="button"
		                  >
		                    Se déconnecter
		                  </button>

		                  <div className="my-1 h-px bg-white/10" />
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
                      const ok = window.confirm(
                        "Réinitialiser avec les données d'exemple ?\n\nAttention : toutes tes saisies actuelles (charges, budgets, dépenses) seront supprimées."
                      );
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
                className="ml-2 hidden rounded-xl border border-white/15 bg-white/7 px-3 py-2 text-sm transition-colors hover:bg-white/10 max-[360px]:px-2 max-[360px]:py-1.5 max-[360px]:text-xs sm:inline-flex"
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

          <nav
            id="month-nav"
            className={cx(
              'mt-3 grid grid-cols-4 gap-2 pb-1 sm:mt-4 sm:flex sm:flex-wrap sm:items-center sm:gap-2',
              !monthsNavOpen && 'hidden',
              'sm:flex',
            )}
            aria-label="Navigation par mois"
          >
            {visibleMonths.map((m) => {
              const selected = m === ym;
              const disabled = isMonthDisabled(m);
              const isArchived = state.months[m]?.archived ?? false;
              const idx = visibleMonths.indexOf(m);
              return (
                <button
                  key={m}
                  ref={(el) => {
                    monthButtonRefs.current[m] = el;
                  }}
                  className={cx(
                    'flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm capitalize transition max-[360px]:gap-1.5 max-[360px]:px-2.5 max-[360px]:py-1 max-[360px]:text-xs sm:w-auto sm:justify-start',
                    selected ? 'border-white/30 bg-white/12 text-slate-100' : 'border-white/15 bg-white/7 text-slate-200',
                    disabled ? 'cursor-not-allowed opacity-50' : !selected && 'hover:bg-white/10',
                  )}
                  onClick={() => {
                    if (disabled) return;
                    setYm(m);
                    setMonthsNavOpen(false);
                  }}
                  aria-current={selected ? 'page' : undefined}
                  type="button"
                  disabled={disabled}
                  title={disabled ? 'Aucune donnée pour ce mois.' : undefined}
                  onKeyDown={(e) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                    e.preventDefault();

                    const pickIndex = (start: number, step: number) => {
                      for (let i = start; i >= 0 && i < visibleMonths.length; i += step) {
                        const candidate = visibleMonths[i]!;
                        if (!isMonthDisabled(candidate)) return i;
                      }
                      return null;
                    };

                    const currentIdx = idx;
                    const nextIdx = (() => {
                      if (e.key === 'Home') return pickIndex(0, 1);
                      if (e.key === 'End') return pickIndex(visibleMonths.length - 1, -1);
                      const step = e.key === 'ArrowLeft' ? -1 : 1;
                      return pickIndex(currentIdx + step, step);
                    })();
                    if (nextIdx === null) return;

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
          <div className={cx('text-xs text-slate-400 max-[360px]:text-[11px]', !monthsNavOpen && 'hidden', 'sm:block')}>
            <span className="max-[360px]:hidden">
              Fenêtre: 3 mois avant / 3 mois après (et le mois sélectionné s’il est hors fenêtre).
            </span>
            <span className="hidden max-[360px]:inline">Fenêtre: ±3 mois.</span>
          </div>
        </div>
	      </header>

	      <main
	        id="main"
	        tabIndex={-1}
	        className="mx-auto max-w-6xl pt-6 pb-24 max-[360px]:pt-4 max-[360px]:pb-20 pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] max-[360px]:pl-[calc(0.75rem_+_env(safe-area-inset-left))] max-[360px]:pr-[calc(0.75rem_+_env(safe-area-inset-right))] sm:pt-10 sm:pb-10 sm:pl-[calc(1.5rem_+_env(safe-area-inset-left))] sm:pr-[calc(1.5rem_+_env(safe-area-inset-right))]"
	      >
	        <div className="grid gap-4 max-[360px]:gap-3 sm:gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
	          <SummaryPanel ym={ym} />
	          <div className="space-y-6 max-[360px]:space-y-4">
            <ChargesTable ym={ym} archived={archived} />
            <BudgetsPanel ym={ym} archived={archived} />
          </div>
        </div>

        <footer className="mt-10 text-center text-[11px] text-slate-400">
          Données synchronisées via{' '}
          <a
            href="https://vercel.com"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-white/15 underline-offset-4 hover:decoration-white/30"
          >
            Vercel
          </a>{' '}
          (Vercel KV / Upstash) · Chiffrées en transit (HTTPS) · App créée par Aurélien Lewin
          <div className="mt-2 font-mono text-[10px] text-slate-500/90">build {__APP_BUILD_ID__}</div>
        </footer>
      </main>

      <QuickAddWidget ym={ym} archived={archived} />
    </div>
  );
}
