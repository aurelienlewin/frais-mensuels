import { useEffect, useMemo, useRef, useState } from 'react';
import { pad2, ymFromDate, type YM } from '../lib/date';
import { eurosToCents } from '../lib/money';
import { useStore } from '../state/store';
import { cx } from './cx';

type Mode = 'perso' | 'essence';

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

export function QuickAddWidget({ ym, archived }: { ym: YM; archived: boolean }) {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState<Mode | null>(null);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [budgetId, setBudgetId] = useState<string>('');

  const amountRef = useRef<HTMLInputElement | null>(null);
  const labelRef = useRef<HTMLInputElement | null>(null);

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
    setAmount('');
    if (open === 'essence') setLabel('Plein');
    if (open === 'perso') setLabel('');
    const inferredId = inferred[open];
    setBudgetId(inferredId || activeBudgets[0]?.id || '');
    window.requestAnimationFrame(() => amountRef.current?.focus());
  }, [open, inferred, activeBudgets]);

  const submit = () => {
    if (!canEdit) return;
    const id = budgetId || inferred[open ?? 'perso'] || '';
    if (!id) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const lbl = label.trim() || (open === 'essence' ? 'Plein' : '');
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
    'fixed z-50 right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:right-6 sm:bottom-6';

  return (
    <div data-tour="quick-add" className={position} onKeyDown={(e) => (e.key === 'Escape' ? setOpen(null) : null)}>
      {open ? (
        <div className="mb-3 w-[min(92vw,420px)] rounded-3xl border border-white/15 bg-ink-950/95 p-4 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.9)]">
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
                ref={amountRef}
                className="h-10 w-full rounded-2xl border border-white/15 bg-white/7 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-200/40 focus:bg-white/10"
                type="number"
                inputMode="decimal"
                step={0.01}
                min={0}
                placeholder="10"
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
              className="h-10 w-full rounded-2xl border border-white/15 bg-white/7 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-200/40 focus:bg-white/10"
              placeholder={open === 'perso' ? 'ex: resto' : 'ex: plein'}
              value={label}
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
                className="h-9 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-3 text-xs text-slate-100 outline-none focus:border-white/25"
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
              className="rounded-2xl border border-fuchsia-200/30 bg-fuchsia-400/15 px-4 py-2 text-sm font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/20 disabled:opacity-50"
              onClick={submit}
              disabled={disabledAll}
            >
              Ajouter
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={cx(
          'motion-hover motion-pop relative h-44 w-44 select-none overflow-hidden rounded-tl-[999px] border border-white/15 bg-ink-950/80 shadow-[0_12px_40px_-30px_rgba(0,0,0,0.85)] [clip-path:circle(100%_at_100%_100%)] sm:hidden',
          disabledAll && 'opacity-60',
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-white/0 to-transparent"
          aria-hidden="true"
        />
        <div className="absolute bottom-4 right-4 grid gap-2">
          <button
            type="button"
            className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl border border-emerald-200/25 bg-emerald-400/12 text-emerald-100 transition-colors active:bg-emerald-400/18 disabled:opacity-50"
            onClick={() => setOpen((v) => (v === 'perso' ? null : 'perso'))}
            disabled={disabledAll}
            aria-label="Ajouter une dépense perso"
          >
            <span className="text-lg leading-none">+</span>
            <span className="text-[10px] font-semibold leading-none">Perso</span>
          </button>
          <button
            type="button"
            className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl border border-sky-200/25 bg-sky-400/12 text-sky-100 transition-colors active:bg-sky-400/18 disabled:opacity-50"
            onClick={() => setOpen((v) => (v === 'essence' ? null : 'essence'))}
            disabled={disabledAll}
            aria-label="Ajouter un plein d’essence"
          >
            <span className="text-lg leading-none">⛽</span>
            <span className="text-[10px] font-semibold leading-none">Essence</span>
          </button>
        </div>
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
