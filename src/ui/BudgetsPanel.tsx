import { useEffect, useMemo, useState } from 'react';
import { daysInMonth, pad2, type YM } from '../lib/date';
import { centsToEuros, eurosToCents, formatEUR, parseEuroAmount } from '../lib/money';
import { budgetsForMonth } from '../state/selectors';
import { useStoreState } from '../state/store';
import { cx } from './cx';
import { InlineNumberInput, InlineTextInput } from './components/InlineInput';

function normalizeSearch(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isFuelBudget(name: string) {
  const s = normalizeSearch(name);
  return ['essence', 'carbur', 'gasoil', 'diesel'].some((k) => s.includes(k));
}

function FormulaHint({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-white/8 text-[10px] font-semibold leading-none text-slate-300 transition-colors hover:bg-white/16 focus-visible:bg-white/16"
        aria-label={label}
        title={text}
      >
        i
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-60 -translate-x-1/2 rounded-xl border border-white/15 bg-ink-950/95 px-2.5 py-2 text-[11px] leading-relaxed text-slate-100 opacity-0 shadow-[0_16px_35px_-18px_rgba(0,0,0,0.95)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:hidden">
        {text}
      </span>
    </span>
  );
}

export function BudgetsPanel({ ym, archived }: { ym: YM; archived: boolean }) {
  const { state } = useStoreState();
  const [budgetsOpen, setBudgetsOpen] = useState(true);
  const budgets = useMemo(
    () => budgetsForMonth(state, ym),
    [state.accounts, state.budgets, state.months, ym],
  );
  const modelById = useMemo(() => new Map(state.budgets.map((b) => [b.id, b])), [state.budgets]);

  return (
    <section
      data-tour="budgets"
      className="fm-panel motion-hover motion-pop overflow-hidden"
    >
      <div className="border-b border-white/15 px-4 py-4 max-[360px]:px-3 max-[360px]:py-3 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-300">Enveloppes</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-shadow-2xs">Budgets & dépenses</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="fm-mobile-section-toggle sm:hidden"
              onClick={() => setBudgetsOpen((v) => !v)}
              aria-expanded={budgetsOpen}
              aria-label={budgetsOpen ? 'Masquer les enveloppes' : 'Afficher les enveloppes'}
              title={budgetsOpen ? 'Masquer les enveloppes' : 'Afficher les enveloppes'}
            >
              <span>{budgetsOpen ? 'Replier' : 'Voir'} enveloppes</span>
              <span aria-hidden="true" className="fm-mobile-section-toggle-icon">
                {budgetsOpen ? '−' : '+'}
              </span>
            </button>
            <button
              type="button"
              className="fm-btn-ghost hidden h-8 w-10 items-center justify-center text-xs font-medium text-slate-200 sm:flex"
              onClick={() => setBudgetsOpen((v) => !v)}
              aria-expanded={budgetsOpen}
              aria-label={budgetsOpen ? 'Masquer les enveloppes' : 'Afficher les enveloppes'}
              title={budgetsOpen ? 'Masquer les enveloppes' : 'Afficher les enveloppes'}
            >
              <span aria-hidden="true" className="text-[18px] font-semibold leading-none">
                {budgetsOpen ? '▴' : '▾'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className={cx('space-y-6 p-4 max-[360px]:space-y-4 max-[360px]:p-3 sm:p-6', !budgetsOpen && 'hidden')}>
        <AddBudgetCard disabled={archived} />
        {budgets.map((b) => (
          <BudgetCard key={b.id} ym={ym} budget={b} model={modelById.get(b.id) ?? null} archived={archived} />
        ))}
        {budgets.length === 0 ? <div className="text-sm text-slate-400">Aucun budget actif.</div> : null}
      </div>
    </section>
  );
}

function AddBudgetCard({ disabled }: { disabled: boolean }) {
  const { state, dispatch } = useStoreState();
  const activeAccounts = useMemo(() => state.accounts.filter((a) => a.active), [state.accounts]);
  const defaultAccountId = activeAccounts.find((a) => a.kind === 'perso')?.id ?? activeAccounts[0]?.id ?? '';

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [scope, setScope] = useState<'perso' | 'commun'>('perso');

  useEffect(() => {
    setAccountId((cur) => cur || defaultAccountId);
  }, [defaultAccountId]);

  const canSubmit = (() => {
    if (disabled) return false;
    if (!name.trim()) return false;
    if (!accountId) return false;
    const parsed = amount.trim() === '' ? 0 : parseEuroAmount(amount);
    if (parsed === null || parsed < 0) return false;
    return true;
  })();

  return (
    <div className={cx('fm-card p-5', disabled && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400">Nouvelle enveloppe</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">Ajouter un budget</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px]">
        <input
          className="fm-input h-10 rounded-2xl px-4 text-sm"
          placeholder="ex: Budget perso"
          value={name}
          disabled={disabled}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nom du budget"
        />
        <div className="relative">
          <input
            className="fm-input h-10 rounded-2xl px-4 pr-10 text-base sm:text-sm"
            placeholder="0"
            inputMode="decimal"
            type="text"
            value={amount}
            disabled={disabled}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Montant réservé (euros)"
          />
          <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-slate-400">€</div>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_140px]">
        <select
          className="fm-input-select h-10 rounded-2xl px-4 text-sm"
          value={accountId}
          disabled={disabled || activeAccounts.length === 0}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label="Compte source"
        >
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id}
            </option>
          ))}
        </select>

        <select
          className="fm-input-select h-10 rounded-2xl px-4 text-sm"
          value={scope}
          disabled={disabled}
          onChange={(e) => setScope(e.target.value === 'commun' ? 'commun' : 'perso')}
          aria-label="Type enveloppe"
        >
          <option value="perso">Perso</option>
          <option value="commun">Commun</option>
        </select>

        <button
          type="button"
          className={cx(
            'fm-btn-soft h-10 rounded-2xl px-4 text-sm',
            !canSubmit && 'opacity-50 hover:bg-slate-400/12',
          )}
          disabled={!canSubmit}
          onClick={() => {
            if (!canSubmit) return;
            const cleanName = name.trim();
            const euros = amount.trim() === '' ? 0 : parseEuroAmount(amount);
            if (!cleanName || euros === null || euros < 0) return;
            dispatch({
              type: 'ADD_BUDGET',
              budget: { name: cleanName, amountCents: eurosToCents(euros), accountId, scope, active: true },
            });
            setName('');
            setAmount('');
          }}
        >
          Ajouter
        </button>
      </div>

      <div className="mt-2 text-xs text-slate-400">
        Astuce: pour l’ajout rapide, utilise un nom contenant <span className="font-mono">perso</span> ou <span className="font-mono">essence</span>.
      </div>
    </div>
  );
}

function BudgetCard({
  ym,
  budget,
  model,
  archived,
}: {
  ym: YM;
  budget: ReturnType<typeof budgetsForMonth>[number];
  model: ReturnType<typeof useStoreState>['state']['budgets'][number] | null;
  archived: boolean;
}) {
  const { state, dispatch } = useStoreState();
  const activeAccounts = useMemo(() => state.accounts.filter((a) => a.active), [state.accounts]);

  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(`${ym}-01`);

  useEffect(() => {
    setDate(`${ym}-01`);
    setLabel('');
    setAmount('');
  }, [ym]);

  const canEdit = !archived && Boolean(model);
  const canDelete = !archived && Boolean(model?.active);
  const [expensesOpen, setExpensesOpen] = useState(true);
  const footerSelectBase = 'fm-input-select h-9 px-2.5 text-slate-100 shadow-inner shadow-black/20 sm:h-8 sm:px-3';
  const footerSelectAccount = `${footerSelectBase} text-[12px] font-medium`;
  const footerSelectType = `${footerSelectBase} text-[11px] font-semibold uppercase tracking-wide`;
  const ratio =
    budget.fundingCents > 0
      ? Math.min(1, Math.max(0, budget.spentCents / budget.fundingCents))
      : budget.spentCents > 0
        ? 1
        : 0;
  const over = budget.remainingToFundCents < 0;
  const canToggleCarryHandling = budget.carryOverSourceTotalCents > 0 || budget.carryOverHandled;
  const canToggleCurrentDebtHandling = budget.carryForwardSourceDebtCents > 0 || budget.carryForwardHandled;

  const hasAccountId = typeof budget.accountId === 'string' && budget.accountId.length > 0;
  const accountInActiveList = hasAccountId ? activeAccounts.some((a) => a.id === budget.accountId) : false;
  const accountValue = accountInActiveList ? budget.accountId : hasAccountId ? '__UNAVAILABLE__' : '';

  const sortedExpenses = useMemo(
    () => [...budget.expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [budget.expenses],
  );
  const defaultLabelPlaceholder = isFuelBudget(budget.name) ? 'ex: plein / essence / gasoil' : 'ex: resto';
  const minDate = `${ym}-01`;
  const maxDate = `${ym}-${pad2(daysInMonth(ym))}`;

  return (
      <div className="fm-card motion-hover p-5 max-[360px]:p-4">
      <div className="grid gap-4">
        <div className="min-w-0">
          <div className="text-xs text-slate-400">Enveloppe</div>
          <InlineTextInput
            ariaLabel="Nom du budget"
            value={budget.name}
            disabled={!canEdit}
            onCommit={(name) => dispatch({ type: 'UPDATE_BUDGET', budgetId: budget.id, patch: { name } })}
          />
        </div>

        <div className="fm-card-soft p-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
            <div className="min-w-0">
              <div className="text-xs text-slate-400">Montant réservé</div>
              <div className="mt-1">
                <InlineNumberInput
                ariaLabel="Montant du budget (euros)"
                value={centsToEuros(budget.amountCents)}
                  step={0.01}
                  min={0}
                  suffix="€"
                disabled={!canEdit}
                onCommit={(euros) => dispatch({ type: 'UPDATE_BUDGET', budgetId: budget.id, patch: { amountCents: eurosToCents(euros) } })}
              />
              </div>
            </div>
            <div className="grid gap-2">
              <div className="fm-stat-row">
                <div className="fm-stat-label text-xs">Montant cible</div>
                <div className="fm-stat-value text-slate-200">{formatEUR(budget.amountCents)}</div>
              </div>
              <div className="fm-stat-row">
                <div className="fm-stat-label text-xs">À virer ce mois</div>
                <div className="fm-stat-value font-semibold text-sky-200">{formatEUR(budget.fundingCents)}</div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
            <div>Dépensé / à virer</div>
            <div className={cx('tabular-nums whitespace-nowrap', over ? 'text-rose-200' : 'text-slate-300')}>
              {formatEUR(budget.spentCents)} / {formatEUR(budget.fundingCents)}
            </div>
          </div>
          {!budget.carryOverHandled && budget.carryOverCreditCents > 0 ? (
            <div className="fm-reliquat-positive mt-3 rounded-xl border px-3 py-2 shadow-[0_12px_28px_-18px_rgba(16,185,129,0.85)]">
              <div className="text-[10px] font-semibold uppercase tracking-wide">Reliquat positif reporté</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                  <div className="leading-tight">
                  {formatEUR(budget.carryOverCreditCents)} déjà reporté du mois précédent
                  </div>
                  <div className="tabular-nums font-semibold">-{formatEUR(budget.carryOverCreditCents)}</div>
                </div>
              <div className="mt-1 text-[11px] text-emerald-100/90">
                Virement réduit: {formatEUR(budget.amountCents)} → {formatEUR(budget.fundingCents)}
              </div>
            </div>
          ) : null}
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label={`Dépenses / budget: ${budget.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
          >
            <div
              className={cx('h-full rounded-full', over ? 'bg-rose-400/70' : 'bg-emerald-400/70')}
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>

          <div className="mt-3 fm-stat-row">
            <div className="fm-stat-label text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span>Reste du mois</span>
                <FormulaHint
                  label={`Formule reste du mois pour ${budget.name}`}
                  text="Reste du mois = montant cible - dépensé. Le rattrapage de dette n'augmente pas ce reste affiché."
                />
              </span>
            </div>
            <div className={cx('fm-stat-value', over ? 'text-rose-200' : 'text-emerald-200')}>
              {formatEUR(budget.remainingToFundCents)}
            </div>
          </div>
          {!canToggleCurrentDebtHandling && budget.carryForwardDebtCents > 0 ? (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-rose-300/20 bg-rose-500/10 px-2 py-1 text-xs text-rose-100">
              <div>Dette à reporter</div>
              <div className="tabular-nums font-semibold">{formatEUR(budget.carryForwardDebtCents)}</div>
            </div>
          ) : null}
        </div>

        {canToggleCarryHandling || canToggleCurrentDebtHandling ? (
          <div className={cx('grid gap-2', canToggleCarryHandling && canToggleCurrentDebtHandling && 'sm:grid-cols-2')}>
            {canToggleCarryHandling ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Entrant (mois précédent)</div>
                {budget.carryOverHandled && budget.carryOverSourceDebtCents > 0 ? (
                  <div className="fm-reliquat-negative mt-1 flex items-center justify-between rounded-lg border px-2 py-1 text-xs">
                    <div>Reliquat dette traité</div>
                    <div className="tabular-nums font-semibold">+{formatEUR(budget.carryOverSourceDebtCents)}</div>
                  </div>
                ) : null}
                {budget.carryOverHandled && budget.carryOverSourceCreditCents > 0 ? (
                  <div className="fm-reliquat-positive mt-1 flex items-center justify-between rounded-lg border px-2 py-1 text-xs">
                    <div>Reliquat positif traité</div>
                    <div className="tabular-nums font-semibold">-{formatEUR(budget.carryOverSourceCreditCents)}</div>
                  </div>
                ) : null}
                {!budget.carryOverHandled && budget.carryOverDebtCents > 0 ? (
                  <div className="fm-reliquat-negative mt-1 flex items-center justify-between rounded-lg border px-2 py-1 text-xs">
                    <div>Dette entrante (sur reste)</div>
                    <div className="tabular-nums font-semibold">+{formatEUR(budget.carryOverDebtCents)}</div>
                  </div>
                ) : null}
                {!budget.carryOverHandled && budget.carryOverCreditCents > 0 ? (
                  <div className="fm-reliquat-positive mt-1 flex items-center justify-between rounded-lg border px-2 py-1 text-xs">
                    <div>Reliquat positif appliqué</div>
                    <div className="tabular-nums font-semibold">-{formatEUR(budget.carryOverCreditCents)}</div>
                  </div>
                ) : null}
                <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-400"
                    checked={budget.carryOverHandled}
                    disabled={!canEdit}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_BUDGET_CARRY_HANDLED',
                        ym,
                        budgetId: budget.id,
                        handled: e.currentTarget.checked,
                      })
                    }
                    aria-label={`Traiter le reliquat entrant du mois précédent pour ${budget.name}`}
                  />
                  <span>Traiter le reliquat entrant (mois précédent)</span>
                </label>
              </div>
            ) : null}

            {canToggleCurrentDebtHandling ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sortant (mois en cours)</div>
                {budget.carryForwardHandled && budget.carryForwardSourceDebtCents > 0 ? (
                  <div className="mt-1 flex items-center justify-between rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100">
                    <div>Dette du mois traitée</div>
                    <div className="tabular-nums font-semibold">{formatEUR(budget.carryForwardSourceDebtCents)}</div>
                  </div>
                ) : null}
                {!budget.carryForwardHandled && budget.carryForwardDebtCents > 0 ? (
                  <div className="mt-1 flex items-center justify-between rounded-lg border border-rose-300/20 bg-rose-500/10 px-2 py-1 text-xs text-rose-100">
                    <div>Dette du mois à reporter</div>
                    <div className="tabular-nums font-semibold">{formatEUR(budget.carryForwardDebtCents)}</div>
                  </div>
                ) : null}
                <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-400"
                    checked={budget.carryForwardHandled}
                    disabled={!canEdit}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_BUDGET_CARRY_FORWARD_HANDLED',
                        ym,
                        budgetId: budget.id,
                        handled: e.currentTarget.checked,
                      })
                    }
                    aria-label={`Traiter la dette du mois en cours pour ${budget.name}`}
                  />
                  <span>Traiter la dette du mois (ne pas reporter)</span>
                </label>
                <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  La dette à reporter est le total restant après application éventuelle du reliquat entrant.
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-slate-200">Dépenses</div>
          <button
            type="button"
            className="fm-mobile-section-toggle sm:hidden"
            onClick={() => setExpensesOpen((v) => !v)}
            aria-expanded={expensesOpen}
            aria-label={expensesOpen ? 'Masquer les dépenses' : 'Afficher les dépenses'}
            title={expensesOpen ? 'Masquer les dépenses' : 'Afficher les dépenses'}
          >
            <span>{expensesOpen ? 'Masquer' : 'Voir'} détail</span>
            <span aria-hidden="true" className="fm-mobile-section-toggle-icon">
              {expensesOpen ? '−' : '+'}
            </span>
          </button>
          <button
            type="button"
            className="fm-btn-ghost hidden h-8 w-10 items-center justify-center text-xs font-medium text-slate-200 sm:flex"
            onClick={() => setExpensesOpen((v) => !v)}
            aria-expanded={expensesOpen}
            aria-label={expensesOpen ? 'Masquer les dépenses' : 'Afficher les dépenses'}
            title={expensesOpen ? 'Masquer les dépenses' : 'Afficher les dépenses'}
          >
            <span aria-hidden="true" className="text-[18px] font-semibold leading-none">
              {expensesOpen ? '▴' : '▾'}
            </span>
          </button>
        </div>

        {expensesOpen ? (
          <div className="fm-card-soft mt-3 grid gap-2 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_140px_96px]">
            <input
              className="fm-input h-9 px-3 text-sm"
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              disabled={!canEdit}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
            />
            <input
              className="fm-input h-9 px-3 text-sm"
              placeholder={defaultLabelPlaceholder}
              value={label}
              disabled={!canEdit}
              onChange={(e) => setLabel(e.target.value)}
              aria-label="Libellé"
            />
            <input
              className="fm-input h-9 px-3 text-sm"
              placeholder="10"
              inputMode="decimal"
              type="text"
              value={amount}
              disabled={!canEdit}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Montant"
            />
              <button
                className={cx(
                  'fm-btn-ghost h-9 px-3 text-sm',
                  !canEdit && 'opacity-50',
                )}
                disabled={!canEdit}
                onClick={() => {
                  const amt = parseEuroAmount(amount);
                  if (amt === null || amt <= 0) return;
                  const lbl = label.trim();
                  if (!lbl) return;

                  dispatch({
                    type: 'ADD_BUDGET_EXPENSE',
                    ym,
                    budgetId: budget.id,
                    expense: { date, label: lbl, amountCents: eurosToCents(amt) },
                  });
                  setLabel('');
                  setAmount('');
                }}
            >
              Ajouter
            </button>
          </div>
          <div className="text-xs text-slate-400">Les montants sont des dépenses (ex: 10€ = -10€).</div>
        </div>
        ) : null}

        {expensesOpen ? (
        <div className="mt-3 space-y-2 sm:hidden">
          {sortedExpenses.map((e) => (
            <div key={e.id} className="fm-card-soft p-3">
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <InlineTextInput
                    ariaLabel="Date de dépense"
                    value={e.date}
                    type="date"
                    disabled={!canEdit}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-950/35 px-2 text-[12px] font-medium text-slate-100 outline-none ring-0 focus:border-white/15 focus:bg-ink-950/45 max-[360px]:text-[11px]"
                    inputProps={{ min: minDate, max: maxDate }}
                    onCommit={(next) => {
                      if (!next || next === e.date) return;
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
                      dispatch({ type: 'UPDATE_BUDGET_EXPENSE', ym, budgetId: budget.id, expenseId: e.id, patch: { date: next } });
                    }}
                  />
                ) : (
                  <div className="min-w-0 flex-1 truncate text-xs text-slate-300">{e.date}</div>
                )}

                {canEdit ? (
                  <button
                    className="fm-btn-ghost flex h-8 w-8 flex-none items-center justify-center text-xs"
                    disabled={!canEdit}
                    onClick={() => dispatch({ type: 'REMOVE_BUDGET_EXPENSE', ym, budgetId: budget.id, expenseId: e.id })}
                    aria-label={`Supprimer dépense ${e.label}`}
                    type="button"
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <div className="min-w-0 flex-1 text-sm text-slate-100">
                  {canEdit ? (
                    <InlineTextInput
                      ariaLabel="Libellé de dépense"
                      value={e.label}
                      disabled={!canEdit}
                      className="h-8 w-full rounded-lg border border-white/10 bg-ink-950/35 px-2 text-[13px] font-medium text-slate-100 outline-none ring-0 focus:border-white/15 focus:bg-ink-950/45"
                      onCommit={(next) => {
                        const clean = next.trim();
                        if (!clean || clean === e.label) return;
                        dispatch({ type: 'UPDATE_BUDGET_EXPENSE', ym, budgetId: budget.id, expenseId: e.id, patch: { label: clean } });
                      }}
                    />
                  ) : (
                    <div className="truncate">{e.label}</div>
                  )}
                </div>

                <div className="flex-none text-right font-medium tabular-nums text-slate-100">
                  {canEdit ? (
                    <InlineNumberInput
                      ariaLabel="Montant de dépense (euros)"
                      value={centsToEuros(e.amountCents)}
                      step={0.01}
                      min={0}
                      suffix="€"
                      disabled={!canEdit}
                      className="ml-auto w-[120px] max-[360px]:w-[104px]"
                      inputClassName="h-8 rounded-lg px-2 text-[13px]"
                      onCommit={(euros) => {
                        const cents = eurosToCents(euros);
                        if (cents === e.amountCents) return;
                        dispatch({
                          type: 'UPDATE_BUDGET_EXPENSE',
                          ym,
                          budgetId: budget.id,
                          expenseId: e.id,
                          patch: { amountCents: cents },
                        });
                      }}
                    />
                  ) : (
                    <>-{formatEUR(e.amountCents)}</>
                  )}
                </div>
              </div>
            </div>
          ))}
          {sortedExpenses.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">Aucune dépense.</div> : null}
        </div>
        ) : null}

        {expensesOpen ? (
        <div className="fm-card mt-3 hidden overflow-hidden sm:block">
          <table className="min-w-full">
            <thead className="bg-ink-950/50 text-left text-xs text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Libellé</th>
                <th className="px-3 py-2 text-right font-medium">Montant</th>
                <th className="w-[56px] px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sortedExpenses.map((e) => (
                <tr key={e.id} className="border-t border-white/15 hover:bg-white/5">
                  <td className="px-3 py-2 text-slate-300">
                    {canEdit ? (
                      <InlineTextInput
                        ariaLabel="Date de dépense"
                        value={e.date}
                        type="date"
                        disabled={!canEdit}
                        className="h-8 w-full rounded-lg border border-white/10 bg-ink-950/35 px-2 text-[13px] font-medium text-slate-100 outline-none ring-0 focus:border-white/15 focus:bg-ink-950/45"
                        inputProps={{ min: minDate, max: maxDate }}
                        onCommit={(next) => {
                          if (!next || next === e.date) return;
                          if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
                          dispatch({ type: 'UPDATE_BUDGET_EXPENSE', ym, budgetId: budget.id, expenseId: e.id, patch: { date: next } });
                        }}
                      />
                    ) : (
                      e.date
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-100">
                    {canEdit ? (
                      <InlineTextInput
                        ariaLabel="Libellé de dépense"
                        value={e.label}
                        disabled={!canEdit}
                        className="h-8 w-full rounded-lg border border-white/10 bg-ink-950/35 px-2 text-[13px] font-medium text-slate-100 outline-none ring-0 focus:border-white/15 focus:bg-ink-950/45"
                        onCommit={(next) => {
                          const clean = next.trim();
                          if (!clean || clean === e.label) return;
                          dispatch({ type: 'UPDATE_BUDGET_EXPENSE', ym, budgetId: budget.id, expenseId: e.id, patch: { label: clean } });
                        }}
                      />
                    ) : (
                      e.label
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-100">
                    {canEdit ? (
                      <InlineNumberInput
                        ariaLabel="Montant de dépense (euros)"
                        value={centsToEuros(e.amountCents)}
                        step={0.01}
                        min={0}
                        suffix="€"
                        disabled={!canEdit}
                        className="ml-auto w-[120px]"
                        inputClassName="h-8 rounded-lg px-2 text-[13px]"
                        onCommit={(euros) => {
                          const cents = eurosToCents(euros);
                          if (cents === e.amountCents) return;
                          dispatch({
                            type: 'UPDATE_BUDGET_EXPENSE',
                            ym,
                            budgetId: budget.id,
                            expenseId: e.id,
                            patch: { amountCents: cents },
                          });
                        }}
                      />
                    ) : (
                      <>-{formatEUR(e.amountCents)}</>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className={cx(
                        'fm-btn-ghost px-2 py-1 text-xs',
                        !canEdit && 'opacity-40',
                      )}
                      disabled={!canEdit}
                      onClick={() => dispatch({ type: 'REMOVE_BUDGET_EXPENSE', ym, budgetId: budget.id, expenseId: e.id })}
                      aria-label={`Supprimer dépense ${e.label}`}
                      type="button"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {sortedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                    Aucune dépense.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-2">
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <div className="px-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Compte</div>
              {canEdit ? (
                <select
                  className={cx('w-full min-w-0 truncate sm:w-44', footerSelectAccount)}
                  value={accountValue}
                  disabled={!canEdit || activeAccounts.length === 0}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next || next === '__UNAVAILABLE__') return;
                    dispatch({ type: 'UPDATE_BUDGET', budgetId: budget.id, patch: { accountId: next } });
                  }}
                  aria-label="Compte du budget"
                >
                  {accountValue === '__UNAVAILABLE__' ? (
                    <option value="__UNAVAILABLE__" disabled>
                      Compte indisponible ({budget.accountId})
                    </option>
                  ) : null}
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="block h-9 w-full min-w-0 truncate rounded-xl border border-white/10 bg-ink-950/20 px-2.5 text-[12px] font-medium leading-9 text-slate-200 shadow-inner shadow-black/10 sm:h-8 sm:w-44 sm:px-3 sm:leading-8">
                  {budget.accountName}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="px-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Type</div>
              {canEdit ? (
                <select
                  className={cx('w-full sm:w-28', footerSelectType)}
                  value={budget.scope}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_BUDGET',
                      budgetId: budget.id,
                      patch: { scope: e.target.value as 'perso' | 'commun' },
                    })
                  }
                  aria-label="Type enveloppe"
                >
                  <option value="perso">Perso</option>
                  <option value="commun">Commun</option>
                </select>
              ) : (
                <span className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-white/10 bg-ink-950/20 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-200 shadow-inner shadow-black/10 sm:h-8 sm:w-28 sm:px-3">
                  {budget.scope === 'commun' ? 'commun' : 'perso'}
                </span>
              )}
            </div>
          </div>

          {model && !model.active ? (
            <div className="mt-2 inline-flex h-6 w-fit flex-none items-center rounded-full bg-white/10 px-2 text-[10px] text-slate-200">
              supprimée
            </div>
          ) : null}
        </div>

        {canDelete ? (
          <button
            type="button"
            className="fm-btn-ghost h-10 w-full rounded-2xl px-4 text-xs font-semibold text-rose-100 hover:bg-rose-400/15 sm:ml-auto sm:h-9 sm:w-auto"
            onClick={() => {
              if (!model) return;
              const ok = window.confirm(
                `Supprimer cette enveloppe ? Elle restera visible dans les mois précédents, mais sera supprimée à partir de ${ym}.`,
              );
              if (!ok) return;
              dispatch({ type: 'REMOVE_BUDGET', ym, budgetId: model.id });
            }}
          >
            Supprimer l’enveloppe
          </button>
        ) : null}
      </div>
    </div>
  );
}
