import { useMemo, useState } from 'react';
import { centsToEuros, eurosToCents, formatEUR } from '../lib/money';
import { chargesForMonth, pickAutoSavingsChargeForMonth } from '../state/selectors';
import { useStoreState } from '../state/store';
import type { Charge } from '../state/types';
import type { YM } from '../lib/date';
import { cx } from './cx';
import { InlineNumberInput } from './components/InlineInput';

function normalizeSearch(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function pickDefaultSavingsTargetAccountId(
  accounts: Array<{ id: string; name: string; kind: 'perso' | 'commun'; active: boolean }>,
  sourceAccountId: string,
) {
  const active = accounts.filter((a) => a.active && a.id !== sourceAccountId);
  if (active.length === 0) return null;
  const keywordMatch = active.find((a) => {
    const hay = normalizeSearch(`${a.name} ${a.id}`);
    return hay.includes('epargne') || hay.includes('saving') || hay.includes('savings');
  });
  return (keywordMatch ?? active[0])?.id ?? null;
}

export function SavingsPanel({ ym, archived }: { ym: YM; archived: boolean }) {
  const { state, dispatch } = useStoreState();
  const [open, setOpen] = useState(false);
  const canEdit = !archived;
  const rows = useMemo(
    () => chargesForMonth(state, ym),
    [state.accounts, state.budgets, state.charges, state.months, ym],
  );
  const savings = useMemo(() => pickAutoSavingsChargeForMonth(state, rows), [rows, state.charges]);
  const activeAccounts = useMemo(() => state.accounts.filter((a) => a.active), [state.accounts]);
  const activePersoAccounts = useMemo(() => activeAccounts.filter((a) => a.kind === 'perso'), [activeAccounts]);
  const accountsById = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts]);
  const savingsMonthState = savings ? state.months[ym]?.charges[savings.row.id] : null;
  const hasManualTotalOverride = typeof savingsMonthState?.amountOverrideCents === 'number';

  const createSavings = () => {
    if (!canEdit) return;
    const sourceAccountId = activePersoAccounts[0]?.id ?? activeAccounts[0]?.id ?? 'PERSONAL_MAIN';
    const destinationAccountId = pickDefaultSavingsTargetAccountId(activeAccounts, sourceAccountId);
    dispatch({
      type: 'ADD_CHARGE',
      charge: {
        name: 'Virement épargne',
        amountCents: 0,
        dayOfMonth: 1,
        accountId: sourceAccountId,
        scope: 'perso',
        payment: 'auto',
        destination: destinationAccountId ? { kind: 'account', accountId: destinationAccountId } : null,
        active: true,
      },
    });
  };

  const floorCents = Math.max(0, savings?.global.amountCents ?? 0);
  const totalCents = Math.max(0, savings?.row.amountCents ?? 0);
  const surplusCents = Math.max(0, totalCents - floorCents);
  const belowFloorCents = Math.max(0, floorCents - totalCents);
  const hasSavings = Boolean(savings);
  const fromAccountId = savings?.row.accountId ?? '';
  const fromAccountInActiveList = fromAccountId ? activeAccounts.some((a) => a.id === fromAccountId) : false;
  const fromAccountValue = fromAccountInActiveList ? fromAccountId : fromAccountId ? '__UNAVAILABLE__' : '';
  const fromAccountUnavailableLabel = (() => {
    if (!fromAccountId || fromAccountInActiveList) return '';
    const acc = accountsById.get(fromAccountId);
    return acc ? `Supprimé: ${acc.id}` : `Inconnu: ${fromAccountId}`;
  })();
  const destinationAccountId = savings?.row.destination?.kind === 'account' ? savings.row.destination.accountId : '';
  const destinationAccountInActiveList = destinationAccountId ? activeAccounts.some((a) => a.id === destinationAccountId) : false;
  const destinationValue = destinationAccountInActiveList ? destinationAccountId : destinationAccountId ? '__UNAVAILABLE__' : '';
  const destinationUnavailableLabel = (() => {
    if (!destinationAccountId || destinationAccountInActiveList) return '';
    const acc = accountsById.get(destinationAccountId);
    return acc ? `Supprimé: ${acc.id}` : `Inconnu: ${destinationAccountId}`;
  })();

  return (
    <section className="fm-panel motion-hover motion-pop overflow-hidden">
      <div className="relative border-b border-white/15 bg-ink-950/75 px-4 py-4 max-[360px]:px-3 max-[360px]:py-3 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm text-slate-300">Épargne</h2>
            <div className="mt-1 text-xl font-semibold tracking-tight text-shadow-2xs">
              {hasSavings ? formatEUR(totalCents) : 'Non configurée'}
            </div>
            {hasSavings ? (
              <div className="mt-1 text-xs text-slate-400">
                Plancher {formatEUR(floorCents)}
                {surplusCents > 0 ? ` + surplus ${formatEUR(surplusCents)}` : ''}
                {belowFloorCents > 0 ? ` - ajustement ${formatEUR(belowFloorCents)}` : ''}
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-400">Crée une charge "Virement épargne" pour activer ce panneau.</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasSavings ? (
              <label className={cx('fm-chip-pill inline-flex items-center gap-2 px-2.5 py-1 text-xs', !canEdit && 'opacity-70')}>
                <input
                  type="checkbox"
                  checked={Boolean(savings?.row.paid)}
                  disabled={!canEdit}
                  onChange={(e) => {
                    if (!savings) return;
                    dispatch({
                      type: 'TOGGLE_CHARGE_PAID',
                      ym,
                      chargeId: savings.row.id,
                      paid: e.target.checked,
                      lockedAmountCents: e.target.checked ? totalCents : undefined,
                    });
                  }}
                  aria-label="Épargne réglée"
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-400"
                />
                Réglée
              </label>
            ) : null}
            <button
              type="button"
              className="fm-btn-ghost order-last hidden h-10 w-10 items-center justify-center text-sm text-slate-200 sm:inline-flex"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Masquer le panneau Épargne" : "Afficher le panneau Épargne"}
              title={open ? "Masquer le panneau Épargne" : "Afficher le panneau Épargne"}
            >
              <span aria-hidden="true" className="text-[22px] font-semibold leading-none">
                {open ? '▴' : '▾'}
              </span>
            </button>
            <button
              type="button"
              className="fm-mobile-section-toggle order-last sm:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Masquer le panneau Épargne" : "Afficher le panneau Épargne"}
              title={open ? "Masquer le panneau Épargne" : "Afficher le panneau Épargne"}
            >
              <span>{open ? 'Replier' : 'Voir'} épargne</span>
              <span aria-hidden="true" className="fm-mobile-section-toggle-icon">
                {open ? '▴' : '▾'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="space-y-3 px-4 py-4 max-[360px]:px-3 max-[360px]:py-3 sm:px-6 sm:py-5">
          {!hasSavings ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-200">Aucune charge épargne détectée.</div>
              <div className="mt-1 text-xs text-slate-400">
                Cette section prend automatiquement la meilleure charge nommée "Épargne" / "Virement épargne".
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className={cx('fm-btn-ghost rounded-2xl px-4 py-2 text-sm', !canEdit && 'opacity-50')}
                  disabled={!canEdit}
                  onClick={createSavings}
                >
                  Créer l'épargne
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <StatRow label="Plancher configuré" value={formatEUR(floorCents)} />
                <StatRow
                  label="Surplus ajouté"
                  value={surplusCents > 0 ? `+${formatEUR(surplusCents)}` : formatEUR(0)}
                  valueClassName={surplusCents > 0 ? 'text-emerald-200' : undefined}
                />
                {belowFloorCents > 0 ? (
                  <StatRow
                    label="Réduction sous plancher"
                    value={`-${formatEUR(belowFloorCents)}`}
                    rowClassName="fm-reliquat-negative"
                    valueClassName="text-rose-200"
                  />
                ) : null}
                <StatRow label="Total épargne du mois" value={formatEUR(totalCents)} strong valueClassName="text-emerald-200" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <div className="text-xs text-slate-400">Montant plancher</div>
                  <InlineNumberInput
                    ariaLabel="Montant plancher d'épargne"
                    value={centsToEuros(floorCents)}
                    step={0.01}
                    min={0}
                    suffix="€"
                    disabled={!canEdit}
                    onCommit={(euros) => {
                      if (!savings) return;
                      dispatch({
                        type: 'UPDATE_CHARGE',
                        chargeId: savings.global.id,
                        patch: { amountCents: eurosToCents(euros) },
                      });
                    }}
                  />
                </label>

                <label className="grid gap-1">
                  <div className="text-xs text-slate-400">Compte source</div>
                  <select
                    className="fm-input-select h-10 rounded-2xl px-3 text-sm"
                    value={fromAccountValue}
                    disabled={!canEdit}
                    onChange={(e) => {
                      if (!savings) return;
                      const value = e.target.value;
                      if (!value || value === '__UNAVAILABLE__') return;
                      dispatch({ type: 'UPDATE_CHARGE', chargeId: savings.global.id, patch: { accountId: value as Charge['accountId'] } });
                    }}
                    aria-label="Compte source de l'épargne"
                  >
                    <option value="" disabled>
                      Compte…
                    </option>
                    {fromAccountValue === '__UNAVAILABLE__' ? (
                      <option value="__UNAVAILABLE__" disabled>
                        {fromAccountUnavailableLabel}
                      </option>
                    ) : null}
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-1">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span>Total épargne du mois (forçage)</span>
                  {hasManualTotalOverride ? (
                    <button
                      type="button"
                      className={cx('fm-btn-ghost h-7 px-2 text-[11px]', (!canEdit || Boolean(savings?.row.paid)) && 'opacity-50')}
                      disabled={!canEdit || Boolean(savings?.row.paid)}
                      onClick={() => {
                        if (!savings) return;
                        dispatch({ type: 'SET_MONTH_CHARGE_AMOUNT_OVERRIDE', ym, chargeId: savings.row.id, amountCents: null });
                      }}
                    >
                      Recalcul auto
                    </button>
                  ) : null}
                </div>
                <InlineNumberInput
                  ariaLabel="Total épargne du mois"
                  value={centsToEuros(totalCents)}
                  step={0.01}
                  min={0}
                  suffix="€"
                  disabled={!canEdit || Boolean(savings?.row.paid)}
                  onCommit={(euros) => {
                    if (!savings) return;
                    dispatch({
                      type: 'SET_MONTH_CHARGE_AMOUNT_OVERRIDE',
                      ym,
                      chargeId: savings.row.id,
                      amountCents: eurosToCents(euros),
                    });
                  }}
                />
                <div className="text-[11px] text-slate-400">
                  {savings?.row.paid
                    ? 'Montant figé (épargne réglée).'
                    : hasManualTotalOverride
                      ? 'Montant forcé pour ce mois.'
                      : 'Laisser vide via "Recalcul auto" pour reprendre le calcul automatique.'}
                </div>
              </label>

              <label className="grid gap-1">
                <div className="text-xs text-slate-400">Compte cible</div>
                <select
                  className="fm-input-select h-10 rounded-2xl px-3 text-sm"
                  value={savings?.row.destination?.kind === 'text' ? '__TEXT__' : destinationValue}
                  disabled={!canEdit}
                  onChange={(e) => {
                    if (!savings) return;
                    const value = e.target.value;
                    if (!value) {
                      dispatch({ type: 'UPDATE_CHARGE', chargeId: savings.global.id, patch: { destination: null } });
                      return;
                    }
                    if (value === '__UNAVAILABLE__') return;
                    if (value === '__TEXT__') return;
                    dispatch({
                      type: 'UPDATE_CHARGE',
                      chargeId: savings.global.id,
                      patch: { destination: { kind: 'account', accountId: value as Charge['accountId'] } },
                    });
                  }}
                  aria-label="Compte cible de l'épargne"
                >
                  <option value="">Aucun</option>
                  {destinationValue === '__UNAVAILABLE__' ? (
                    <option value="__UNAVAILABLE__" disabled>
                      {destinationUnavailableLabel}
                    </option>
                  ) : null}
                  {savings?.row.destination?.kind === 'text' ? (
                    <option value="__TEXT__" disabled>
                      Autre: {savings.row.destination.text || 'texte'}
                    </option>
                  ) : null}
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function StatRow({
  label,
  value,
  strong,
  rowClassName,
  valueClassName,
}: {
  label: string;
  value: string;
  strong?: boolean;
  rowClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cx('fm-stat-row', rowClassName)}>
      <div className={cx('fm-stat-label', strong ? 'text-slate-200' : 'text-slate-400')}>{label}</div>
      <div className={cx('fm-stat-value', strong ? 'font-semibold text-slate-100' : 'text-slate-200', valueClassName)}>{value}</div>
    </div>
  );
}
