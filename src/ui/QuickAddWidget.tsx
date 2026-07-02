import { useEffect, useMemo, useRef, useState } from 'react';
import { pad2, ymFromDate, type YM } from '../lib/date';
import { eurosToCents, parseEuroAmount } from '../lib/money';
import { useStoreState } from '../state/store';
import { cx } from './cx';

type Mode = 'perso' | 'essence';
const FUEL_EXPENSE_LABEL = 'Essence';

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function defaultDateForYm(ym: YM) {
  const today = new Date();
  const todayYm = ymFromDate(today);
  if (todayYm === ym) return todayIsoLocal();
  return `${ym}-01`;
}

function findBudgetIdByKeywords(
  budgets: Array<{ id: string; name: string; active: boolean }>,
  keywords: string[],
): string | null {
  const active = budgets.filter((b) => b.active);
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const kws = keywords.map(normalize);
  const direct = active.find((b) => kws.some((k) => normalize(b.name).includes(k)));
  return direct?.id ?? null;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function QuickAddWidget({ ym, archived }: { ym: YM; archived: boolean }) {
  const { state, dispatch } = useStoreState();
  const [open, setOpen] = useState<Mode | null>(null);
  const [showTop, setShowTop] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [budgetId, setBudgetId] = useState<string>('');

  const labelRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const prevActiveRef = useRef<HTMLElement | null>(null);

  const activeBudgets = useMemo(() => state.budgets.filter((b) => b.active), [state.budgets]);

  const inferred = useMemo(() => {
    return {
      perso: findBudgetIdByKeywords(activeBudgets, ['budget perso', 'perso']) ?? '',
      essence: findBudgetIdByKeywords(activeBudgets, ['essence', 'carbur']) ?? '',
    };
  }, [activeBudgets]);

  const canEdit = !archived;

  useEffect(() => {
    if (!open) return;
    prevActiveRef.current = (document.activeElement as HTMLElement | null) ?? null;
    setAmount('');
    if (open === 'essence') setLabel(FUEL_EXPENSE_LABEL);
    if (open === 'perso') setLabel('');
    const inferredId = inferred[open];
    setBudgetId(inferredId || activeBudgets[0]?.id || '');

    return () => {
      prevActiveRef.current?.focus?.();
      prevActiveRef.current = null;
    };
  }, [open, inferred, activeBudgets]);

  useEffect(() => {
    let raf = 0;

    const getScrollTop = () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
      const scrollEl = document.scrollingElement;
      const y = scrollEl ? scrollEl.scrollTop : window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      return Math.max(0, y);
    };

    const update = () => {
      raf = 0;
      setShowTop(getScrollTop() > 160);
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setKeyboardInset(0);
      return;
    }
    if (typeof window === 'undefined' || typeof window.visualViewport === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const updateInset = () => {
      const viewportBottom = vv.offsetTop + vv.height;
      const overlap = Math.max(0, window.innerHeight - viewportBottom);
      // Ignore tiny viewport shifts caused by browser chrome.
      setKeyboardInset(overlap > 80 ? Math.round(overlap) : 0);
    };

    updateInset();
    vv.addEventListener('resize', updateInset);
    vv.addEventListener('scroll', updateInset);
    window.addEventListener('orientationchange', updateInset);
    return () => {
      vv.removeEventListener('resize', updateInset);
      vv.removeEventListener('scroll', updateInset);
      window.removeEventListener('orientationchange', updateInset);
    };
  }, [open]);

  const submit = () => {
    if (!canEdit) return;
    const id = budgetId || inferred[open ?? 'perso'] || '';
    if (!id) return;
    const amt = parseEuroAmount(amount);
    if (amt === null || amt === 0) return;
    const lbl = open === 'essence' ? FUEL_EXPENSE_LABEL : label.trim();
    if (!lbl) return;

    dispatch({
      type: 'ADD_BUDGET_EXPENSE',
      ym,
      budgetId: id,
      expense: { date: defaultDateForYm(ym), label: lbl, amountCents: eurosToCents(amt) },
    });
    setOpen(null);
    setAmount('');
    setLabel('');
  };

  const disabledAll = !canEdit || activeBudgets.length === 0;
  const position =
    'fixed z-50 left-0 right-0 bottom-[calc(1rem_+_env(safe-area-inset-bottom))] pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] max-[360px]:bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))] max-[360px]:pl-[calc(0.75rem_+_env(safe-area-inset-left))] max-[360px]:pr-[calc(0.75rem_+_env(safe-area-inset-right))] sm:left-auto sm:right-6 sm:bottom-6 sm:pl-0 sm:pr-0';

  return (
    <div
      data-tour="quick-add"
      className={cx(position, 'flex flex-col items-end gap-2 transition-transform duration-200 ease-out')}
      style={open && keyboardInset > 0 ? { transform: `translateY(-${keyboardInset}px)` } : undefined}
    >
      {showTop && !open ? (
        <button
          type="button"
          className="motion-hover motion-pop flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-ink-950/85 text-[12px] font-semibold text-slate-200 shadow-[0_16px_50px_-36px_rgba(0,0,0,0.9)] backdrop-blur transition-colors hover:bg-ink-950/95"
          onClick={() => {
            const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
            window.scrollTo({ top: 0, behavior });
          }}
          aria-label="Retour en haut"
          title="Retour en haut"
        >
          ↑
        </button>
      ) : null}

      {open ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={open === 'perso' ? 'Ajout rapide (dépense perso)' : 'Ajout rapide (plein d’essence)'}
          className="w-full max-w-[420px] self-center rounded-3xl border border-white/15 bg-ink-950/95 p-4 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.9)]"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(null);
              return;
            }
            if (e.key !== 'Tab') return;

            const root = dialogRef.current;
            if (!root) return;
            const focusables = Array.from(
              root.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'),
            ).filter((x) => !x.hasAttribute('disabled') && x.getAttribute('aria-hidden') !== 'true');
            if (focusables.length === 0) return;

            const first = focusables[0]!;
            const last = focusables[focusables.length - 1]!;
            const active = document.activeElement as HTMLElement | null;
            const shift = (e as unknown as { shiftKey?: boolean }).shiftKey === true;

            if (shift && active === first) {
              e.preventDefault();
              last.focus();
              return;
            }
            if (!shift && active === last) {
              e.preventDefault();
              first.focus();
            }
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ajout rapide</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">
                {open === 'perso' ? 'Dépense perso' : 'Plein d’essence'}
              </div>
            </div>
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition-colors hover:bg-white/10"
              onClick={() => setOpen(null)}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[120px_1fr]">
            <div className="relative">
              <input
                className="fm-input h-10 rounded-2xl px-4 text-base sm:text-sm"
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder="10 ou -400,99"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
                aria-label="Montant"
              />
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-slate-400">€</div>
            </div>

            <input
              ref={labelRef}
              className="fm-input h-10 rounded-2xl px-4 text-base sm:text-sm disabled:opacity-90"
              placeholder={open === 'perso' ? 'ex: resto' : FUEL_EXPENSE_LABEL}
              value={open === 'essence' ? FUEL_EXPENSE_LABEL : label}
              disabled={open === 'essence'}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              aria-label="Libellé"
            />
          </div>

          {!inferred[open] ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px]">
              <div className="text-xs text-slate-400">
                Aucun budget correspondant trouvé. Choisis une enveloppe cible pour cet ajout.
              </div>
              <select
                className="fm-input-select h-10 rounded-2xl px-3 text-base sm:h-9 sm:text-xs"
                value={budgetId}
                onChange={(e) => setBudgetId(e.target.value)}
                aria-label="Budget cible"
              >
                <option value="" disabled>
                  Choisir…
                </option>
                {activeBudgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-2xl border border-white/15 bg-white/7 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10"
              onClick={() => setOpen(null)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="rounded-2xl border border-slate-200/30 bg-slate-400/15 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-400/20 disabled:opacity-50"
              onClick={submit}
              disabled={disabledAll}
            >
              Ajouter
            </button>
          </div>
        </div>
      ) : null}

      <div className={cx('motion-pop grid w-full grid-cols-[1fr_1fr_auto] items-center gap-2 sm:hidden', disabledAll && 'opacity-60')}>
        <button
          type="button"
          className="min-h-12 rounded-full border border-emerald-200/25 bg-emerald-400/16 px-4 text-sm font-semibold text-emerald-50 shadow-[0_18px_60px_-38px_rgba(0,0,0,0.95)] backdrop-blur transition-colors active:bg-emerald-400/24 disabled:opacity-50 max-[360px]:px-3"
          onClick={() => {
            if (disabledAll) return;
            setOpen('perso');
          }}
          disabled={disabledAll}
          aria-label="Ajouter une dépense perso"
        >
          + Perso
        </button>
        <button
          type="button"
          className="min-h-12 rounded-full border border-sky-200/25 bg-sky-400/16 px-4 text-sm font-semibold text-sky-50 shadow-[0_18px_60px_-38px_rgba(0,0,0,0.95)] backdrop-blur transition-colors active:bg-sky-400/24 disabled:opacity-50 max-[360px]:px-3"
          onClick={() => {
            if (disabledAll) return;
            setOpen('essence');
          }}
          disabled={disabledAll}
          aria-label="Ajouter un plein d’essence"
        >
          Essence
        </button>
        <button
          type="button"
          className={cx(
            'flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-ink-950/90 text-base font-semibold text-slate-100 shadow-[0_18px_60px_-38px_rgba(0,0,0,0.95)] backdrop-blur transition-colors active:bg-white/12',
            !showTop && 'opacity-45',
          )}
          onClick={() => {
            if (!showTop) return;
            const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
            window.scrollTo({ top: 0, behavior });
          }}
          aria-label="Retour en haut"
          disabled={!showTop}
        >
          ↑
        </button>
      </div>

      <div
        className={cx(
          'motion-hover motion-pop hidden items-center gap-2 rounded-full border border-white/15 bg-ink-950/80 px-3 py-2 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.85)] sm:flex',
          disabledAll && 'opacity-60',
        )}
      >
        <button
          type="button"
          className="rounded-full border border-emerald-200/25 bg-emerald-400/12 px-4 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/18 disabled:opacity-50"
          onClick={() => setOpen((v) => (v === 'perso' ? null : 'perso'))}
          disabled={disabledAll}
          aria-label="Ajouter une dépense perso"
        >
          + Perso
        </button>
        <button
          type="button"
          className="rounded-full border border-sky-200/25 bg-sky-400/12 px-4 py-2 text-sm font-semibold text-sky-100 transition-colors hover:bg-sky-400/18 disabled:opacity-50"
          onClick={() => setOpen((v) => (v === 'essence' ? null : 'essence'))}
          disabled={disabledAll}
          aria-label="Ajouter un plein d’essence"
        >
          ⛽ Essence
        </button>
      </div>
    </div>
  );
}
