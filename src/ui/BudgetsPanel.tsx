import { useEffect, useMemo, useState } from 'react';
import { daysInMonth, pad2, type YM } from '../lib/date';
import { centsToEuros, eurosToCents, formatEUR, parseEuroAmount } from '../lib/money';
import { budgetsForMonth } from '../state/selectors';
import { useStore } from '../state/store';
import { cx } from './cx';
import { InlineNumberInput, InlineTextInput } from './components/InlineInput';

function normalizeSearch(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isFuelBudget(name: string) {
  const s = normalizeSearch(name);
  return ['essence', 'carbur', 'gasoil', 'diesel'].some((k) => s.includes(k));
}

export function BudgetsPanel({ ym, archived }: { ym: YM; archived: boolean }) {
  const { state } = useStore();
  const budgets = budgetsForMonth(state, ym);
  const modelById = useMemo(() => new Map(state.budgets.map((b) => [b.id, b])), [state.budgets]);

  return (
    <section
      data-tour="budgets"
      className="motion-hover motion-pop overflow-hidden rounded-3xl border border-white/15 bg-ink-950/60 shadow-[0_12px_40px_-30px_rgba(0,0,0,0.85)]"
    >
      <div className="border-b border-white/15 px-4 py-4 max-[360px]:px-3 max-[360px]:py-3 sm:px-6 sm:py-5">
        <div className="text-sm text-slate-300">Enveloppes</div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Budgets & dépenses</h2>
      </div>

      <div className="space-y-6 p-4 max-[360px]:space-y-4 max-[360px]:p-3 sm:p-6">
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
  const { state, dispatch } = useStore();
  const activeAccounts = useMemo(() => state.accounts.filter((a) => a.active), [state.accounts]);
  const defaultAccountId = activeAccounts.find((a) => a.kind === 'perso')?.id ?? activeAccounts[0]?.id ?? '';

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(defaultAccountId);

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
    <div className={cx('rounded-3xl border border-white/15 bg-ink-950/45 p-5', disabled && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400">Nouvelle enveloppe</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">Ajouter un budget</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px]">
        <input
          className="h-10 w-full rounded-2xl border border-white/15 bg-white/7 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-200/40 focus:bg-white/10"
          placeholder="ex: Budget perso"
          value={name}
          disabled={disabled}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nom du budget"
        />
        <div className="relative">
          <input
            className="h-10 w-full rounded-2xl border border-white/15 bg-white/7 px-4 pr-10 text-base text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-200/40 focus:bg-white/10 sm:text-sm"
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

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px]">
        <select
          className="h-10 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-4 text-sm text-slate-100 outline-none focus:border-white/25"
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

        <button
          type="button"
          className={cx(
            'h-10 rounded-2xl border border-fuchsia-200/25 bg-fuchsia-400/12 px-4 text-sm font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/18',
            !canSubmit && 'opacity-50 hover:bg-fuchsia-400/12',
          )}
          disabled={!canSubmit}
          onClick={() => {
            if (!canSubmit) return;
            const cleanName = name.trim();
            const euros = amount.trim() === '' ? 0 : parseEuroAmount(amount);
            if (!cleanName || euros === null || euros < 0) return;
            dispatch({
              type: 'ADD_BUDGET',
              budget: { name: cleanName, amountCents: eurosToCents(euros), accountId, active: true },
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
  model: ReturnType<typeof useStore>['state']['budgets'][number] | null;
  archived: boolean;
}) {
  const { state, dispatch } = useStore();

  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(`${ym}-01`);

  useEffect(() => {
    setDate(`${ym}-01`);
    setLabel('');
    setAmount('');
  }, [ym]);

  const canEdit = !archived && Boolean(model);
  const ratio = budget.amountCents > 0 ? Math.min(1, Math.max(0, budget.spentCents / budget.amountCents)) : 0;
  const over = budget.remainingCents < 0;

  const sortedExpenses = [...budget.expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const defaultLabelPlaceholder = isFuelBudget(budget.name) ? 'ex: plein / essence / gasoil' : 'ex: resto';
  const minDate = `${ym}-01`;
  const maxDate = `${ym}-${pad2(daysInMonth(ym))}`;

  return (
      <div className="motion-hover rounded-3xl border border-white/15 bg-ink-950/45 p-5 max-[360px]:p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[220px] flex-1">
          <div className="truncate text-xs text-slate-400">Enveloppe</div>
          <InlineTextInput
            ariaLabel="Nom du budget"
            value={budget.name}
            disabled={!canEdit}
            onCommit={(name) => dispatch({ type: 'UPDATE_BUDGET', budgetId: budget.id, patch: { name } })}
          />
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-400 max-[360px]:flex-col max-[360px]:items-start max-[360px]:justify-start max-[360px]:gap-1">
            <div className="min-w-0 flex-1 truncate max-[360px]:w-full">{budget.accountName}</div>
            <div className={cx('tabular-nums whitespace-nowrap max-[360px]:self-end', over ? 'text-rose-200' : 'text-slate-300')}>
              {formatEUR(budget.spentCents)} / {formatEUR(budget.amountCents)}
            </div>
          </div>
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
        </div>

        <div className="w-full max-w-[260px]">
          <div className="text-xs text-slate-400">Montant réservé</div>
          <InlineNumberInput
            ariaLabel="Montant du budget (euros)"
            value={centsToEuros(budget.amountCents)}
            step={0.01}
            min={0}
            suffix="€"
            disabled={!canEdit}
            onCommit={(euros) => dispatch({ type: 'UPDATE_BUDGET', budgetId: budget.id, patch: { amountCents: eurosToCents(euros) } })}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <div>Reste</div>
            <div className={cx('tabular-nums', over ? 'text-rose-200' : 'text-emerald-200')}>{formatEUR(budget.remainingCents)}</div>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-sm font-medium text-slate-200">Dépenses</div>

        <div className="mt-3 grid gap-2 rounded-2xl border border-white/15 bg-ink-950/45 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_140px_96px]">
            <input
              className="h-9 rounded-xl border border-white/15 bg-white/7 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-200/40 focus:bg-white/10"
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              disabled={!canEdit}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
            />
            <input
              className="h-9 rounded-xl border border-white/15 bg-white/7 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-200/40 focus:bg-white/10"
              placeholder={defaultLabelPlaceholder}
              value={label}
              disabled={!canEdit}
              onChange={(e) => setLabel(e.target.value)}
              aria-label="Libellé"
            />
            <input
              className="h-9 rounded-xl border border-white/15 bg-white/7 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-200/40 focus:bg-white/10"
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
	                'h-9 rounded-xl border border-white/15 bg-white/7 px-3 text-sm transition-colors duration-150 hover:bg-white/10',
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

        <div className="mt-3 space-y-2 sm:hidden">
          {sortedExpenses.map((e) => (
            <div key={e.id} className="rounded-2xl border border-white/15 bg-ink-950/35 p-3">
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <InlineTextInput
                    ariaLabel="Date de dépense"
                    value={e.date}
                    type="date"
                    disabled={!canEdit}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 text-[12px] font-medium text-slate-100 outline-none ring-0 focus:border-white/15 focus:bg-white/10 max-[360px]:text-[11px]"
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
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-xl border border-white/15 bg-white/7 text-xs transition-colors duration-150 hover:bg-white/10"
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
                      className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-[13px] font-medium text-slate-100 outline-none ring-0 focus:border-white/15 focus:bg-white/10"
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

        <div className="mt-3 hidden overflow-hidden rounded-2xl border border-white/15 sm:block">
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
                        className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-[13px] font-medium text-slate-100 outline-none ring-0 focus:border-white/15 focus:bg-white/10"
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
                        className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-[13px] font-medium text-slate-100 outline-none ring-0 focus:border-white/15 focus:bg-white/10"
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
                        'rounded-xl border border-white/15 bg-white/7 px-2 py-1 text-xs transition-colors duration-150 hover:bg-white/10',
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
      </div>
    </div>
  );
}
