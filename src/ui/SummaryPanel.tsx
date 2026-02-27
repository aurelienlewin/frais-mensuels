import { useEffect, useMemo, useRef, useState } from 'react';
import { centsToEuros, eurosToCents, formatEUR, parseEuroAmount } from '../lib/money';
import { budgetsForMonth, chargesForMonth, totalsByAccount, totalsForMonth } from '../state/selectors';
import { useStoreState } from '../state/store';
import type { YM } from '../lib/date';
import { cx } from './cx';
import { DonutChart, type DonutSegment } from './components/DonutChart';
import { InlineTextInput } from './components/InlineInput';
import type { Account } from '../state/types';

export function SummaryPanel({ ym }: { ym: YM }) {
  const { state, dispatch } = useStoreState();
  const charges = useMemo(
    () => chargesForMonth(state, ym),
    [state.accounts, state.budgets, state.charges, state.months, ym],
  );
  const budgets = useMemo(
    () => budgetsForMonth(state, ym),
    [state.accounts, state.budgets, state.months, ym],
  );
  const totals = useMemo(
    () => totalsForMonth(state, ym, { charges, budgets }),
    [budgets, charges, state.months, state.salaryCents, ym],
  );
  const byAccount = useMemo(
    () => totalsByAccount(state, ym, { charges, budgets }),
    [budgets, charges, state.accounts, ym],
  );
  const budgetsCardsComputedCents = useMemo(
    () =>
      budgets.reduce((acc, b) => {
        const fundingCents = Math.max(0, b.amountCents + b.carryOverDebtCents - b.carryOverCreditCents);
        const myShareCents =
          b.scope === 'commun'
            ? Math.round((fundingCents * (typeof b.splitPercent === 'number' && Number.isFinite(b.splitPercent) ? b.splitPercent : 50)) / 100)
            : fundingCents;
        return acc + myShareCents;
      }, 0),
    [budgets],
  );
  const budgetsInvariantDeltaCents = totals.totalBudgetsCents - budgetsCardsComputedCents;
  const totalByAccountCents = useMemo(() => byAccount.reduce((acc, a) => acc + a.totalCents, 0), [byAccount]);
  const accountSummaryDeltaCents = totals.totalProvisionCents - totalByAccountCents;
  const hasUnknownAccountSummaryRow = useMemo(() => byAccount.some((a) => !a.isKnownAccount), [byAccount]);
  const chargesByAccount = useMemo(() => {
    const map = new Map<Account['id'], { ids: string[]; unpaidCount: number }>();
    for (const r of charges) {
      const key = r.destination?.kind === 'account' ? r.destination.accountId : r.accountId;
      const prev = map.get(key) ?? { ids: [], unpaidCount: 0 };
      prev.ids.push(r.id);
      if (!r.paid) prev.unpaidCount += 1;
      map.set(key, prev);
    }
    return map;
  }, [charges]);
  const [salaryDraft, setSalaryDraft] = useState(() => String(centsToEuros(totals.salaryCents)));
  const [salaryEditing, setSalaryEditing] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const archived = state.months[ym]?.archived ?? false;

  useEffect(() => {
    if (!salaryEditing) setSalaryDraft(String(centsToEuros(totals.salaryCents)));
  }, [salaryEditing, totals.salaryCents]);

  const reliquatDebtImpactCents = useMemo(() => budgets.reduce((acc, b) => acc + b.carryOverDebtMyShareCents, 0), [budgets]);
  const reliquatCreditImpactCents = useMemo(
    () => budgets.reduce((acc, b) => acc + Math.max(0, -b.carryOverMyShareCents), 0),
    [budgets],
  );
  const autoSavingsBreakdown = useMemo(() => {
    const globalsById = new Map(state.charges.map((c) => [c.id, c]));
    const normalizeName = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const isSavingsName = (name: string) => {
      const normalized = normalizeName(name);
      return (
        normalized === 'epargne' ||
        normalized === 'virement epargne' ||
        normalized.includes('epargne') ||
        normalized.includes('eparne')
      );
    };

    const candidates = charges
      .map((r) => {
        const global = globalsById.get(r.id);
        if (!global || !global.active) return null;
        if (r.scope !== 'perso') return null;
        if (!isSavingsName(r.name)) return null;

        const normalized = normalizeName(r.name);
        const exact =
          normalized === 'epargne' || normalized === 'virement epargne' || normalized === 'eparne' || normalized === 'virement eparne';
        const preferred = normalized.startsWith('virement epargne') || normalized.startsWith('virement eparne');
        const autoPayment = global.payment === 'auto';
        const rank = (exact ? 100 : 0) + (preferred ? 10 : 0) + (autoPayment ? 5 : 0);
        return { row: r, global, rank };
      })
      .filter((x): x is { row: (typeof charges)[number]; global: (typeof state.charges)[number]; rank: number } => x !== null)
      .sort((a, b) => {
        if (a.rank !== b.rank) return b.rank - a.rank;
        if (a.row.sortOrder !== b.row.sortOrder) return a.row.sortOrder - b.row.sortOrder;
        return a.row.id.localeCompare(b.row.id);
      });

    if (candidates.length === 0) return null;
    const selected = candidates[0]!;
    const salaryCents = state.months[ym]?.salaryCents ?? state.salaryCents;
    const otherChargesTotalCents = charges.reduce((acc, r) => {
      if (r.id === selected.row.id) return acc;
      return acc + (r.scope === 'commun' ? r.myShareCents : r.amountCents);
    }, 0);
    const requiredWithoutSavingsCents = otherChargesTotalCents + totals.totalBudgetsCents;
    const floorCents = Math.max(0, selected.global.amountCents);
    const currentCents = Math.max(0, selected.row.amountCents);
    const surplusCents = Math.max(0, currentCents - floorCents);
    const belowFloorCents = Math.max(0, floorCents - currentCents);
    const shortfallAfterZeroCents = Math.max(0, requiredWithoutSavingsCents - salaryCents);
    const baseBeforeCarryCents = salaryCents - otherChargesTotalCents - totals.totalBudgetsBaseCents - floorCents;
    const structuralGrossBeforeDebtCents = Math.max(0, baseBeforeCarryCents);
    const afterDebtCents = baseBeforeCarryCents - reliquatDebtImpactCents;
    const structuralNetBeforeModelAdjustCents = Math.max(0, afterDebtCents);
    const structuralDebtAbsorbedCents = Math.max(0, structuralGrossBeforeDebtCents - structuralNetBeforeModelAdjustCents);
    const withCreditCents = afterDebtCents + reliquatCreditImpactCents;
    let structuralSurplusCents = Math.max(0, afterDebtCents);
    let bonusCreditSurplusCents = Math.max(0, withCreditCents) - structuralSurplusCents;
    if (bonusCreditSurplusCents < 0) bonusCreditSurplusCents = 0;
    if (state.months[ym]?.charges[selected.row.id]?.paid === true) {
      structuralSurplusCents = surplusCents;
      bonusCreditSurplusCents = 0;
    } else {
      const modeled = structuralSurplusCents + bonusCreditSurplusCents;
      if (modeled !== surplusCents) {
        structuralSurplusCents = Math.max(0, structuralSurplusCents + (surplusCents - modeled));
      }
    }
    const locked = state.months[ym]?.charges[selected.row.id]?.paid === true;
    return {
      floorCents,
      currentCents,
      surplusCents,
      belowFloorCents,
      structuralSurplusCents,
      bonusCreditSurplusCents,
      debtImpactCents: reliquatDebtImpactCents,
      structuralGrossBeforeDebtCents,
      structuralDebtAbsorbedCents,
      salaryCents,
      requiredWithoutSavingsCents,
      shortfallAfterZeroCents,
      locked,
    };
  }, [
    charges,
    reliquatCreditImpactCents,
    reliquatDebtImpactCents,
    state.charges,
    state.months,
    state.salaryCents,
    totals.totalBudgetsBaseCents,
    totals.totalBudgetsCents,
    ym,
  ]);

  const repartition = (() => {
    const perso = totals.totalPersoCents;
    const commun = totals.totalCommunPartCents;
    const envelopes = totals.totalBudgetsCents;
    const salary = totals.salaryCents;
    const consumed = perso + commun + envelopes;
    const remaining = Math.max(0, salary - consumed);
    const base = remaining > 0 ? salary : Math.max(consumed, 1);

    const segments: DonutSegment[] = [
      { id: 'commun', label: 'Commun (ma part)', value: commun, color: 'rgb(56 189 248)' },
      { id: 'perso', label: 'Perso', value: perso, color: 'rgb(52 211 153)' },
      { id: 'envelopes', label: 'Enveloppes', value: envelopes, color: 'rgb(167 139 250)' },
      ...(remaining > 0 ? [{ id: 'remaining', label: 'Reste', value: remaining, color: 'rgb(226 232 240)' }] : []),
    ].filter((s) => s.value > 0);

    return {
      segments,
      baseCents: base,
      consumedCents: consumed,
      remainingCents: salary - consumed, // can be negative
      remainingPositiveCents: remaining,
      label: remaining > 0 ? 'Base: salaire' : 'Base: sorties',
    };
  })();

  const [activeSegId, setActiveSegId] = useState<string | null>(null);
  const activeSeg = repartition.segments.find((s) => s.id === activeSegId) ?? null;
  const centerTop = activeSeg ? activeSeg.label : 'Reste';
  const centerBottom = activeSeg ? formatEUR(activeSeg.value) : formatEUR(repartition.remainingCents);
  const centerTone =
    activeSeg?.id === 'commun'
      ? 'text-sky-200'
      : activeSeg?.id === 'perso'
        ? 'text-emerald-200'
        : activeSeg?.id === 'envelopes'
          ? 'text-slate-200'
          : activeSeg?.id === 'remaining'
            ? 'text-slate-200'
            : repartition.remainingCents < 0
              ? 'text-rose-200'
              : 'text-emerald-200';
  const savingsRepartition = useMemo(() => {
    if (!autoSavingsBreakdown) return null;
    const baseCents = Math.min(autoSavingsBreakdown.floorCents, autoSavingsBreakdown.currentCents);
    const segments: DonutSegment[] = [
      { id: 'savings-base', label: 'Base configurée', value: baseCents, color: 'rgb(148 163 184)' },
      {
        id: 'savings-surplus-core',
        label: 'Surplus structurel',
        value: autoSavingsBreakdown.structuralSurplusCents,
        color: 'rgb(34 197 94)',
      },
      {
        id: 'savings-surplus-credit',
        label: 'Bonus reliquat +',
        value: autoSavingsBreakdown.bonusCreditSurplusCents,
        color: 'rgb(16 185 129)',
      },
    ].filter((s) => s.value > 0);
    return {
      segments,
      totalCents: autoSavingsBreakdown.currentCents,
      locked: autoSavingsBreakdown.locked,
      hasSurplus: autoSavingsBreakdown.surplusCents > 0,
      debtImpactCents: autoSavingsBreakdown.debtImpactCents,
      structuralGrossBeforeDebtCents: autoSavingsBreakdown.structuralGrossBeforeDebtCents,
      structuralDebtAbsorbedCents: autoSavingsBreakdown.structuralDebtAbsorbedCents,
      structuralSurplusCents: autoSavingsBreakdown.structuralSurplusCents,
      bonusCreditSurplusCents: autoSavingsBreakdown.bonusCreditSurplusCents,
    };
  }, [autoSavingsBreakdown]);
  const [activeSavingsSegId, setActiveSavingsSegId] = useState<string | null>(null);
  const activeSavingsSeg = savingsRepartition?.segments.find((s) => s.id === activeSavingsSegId) ?? null;
  const savingsCenterTop = activeSavingsSeg?.label ?? 'Épargne';
  const savingsCenterBottom = activeSavingsSeg ? formatEUR(activeSavingsSeg.value) : formatEUR(savingsRepartition?.totalCents ?? 0);
  const savingsCenterTone =
    activeSavingsSeg?.id === 'savings-surplus-core' || activeSavingsSeg?.id === 'savings-surplus-credit' ? 'text-emerald-200' : 'text-slate-200';
  const savingsCenterHint =
    !activeSavingsSeg && savingsRepartition
      ? `Brut ${formatEUR(savingsRepartition.structuralGrossBeforeDebtCents)} - dette ${formatEUR(savingsRepartition.structuralDebtAbsorbedCents)} = net ${formatEUR(savingsRepartition.structuralSurplusCents)}`
      : undefined;
  const savingsCurrentCents = autoSavingsBreakdown?.currentCents ?? 0;
  const chargesWithoutSavingsCents = Math.max(0, totals.totalPourMoiCents - savingsCurrentCents);
  const chartSlides = useMemo<Array<'savings' | 'global'>>(
    () => (savingsRepartition ? ['savings', 'global'] : ['global']),
    [savingsRepartition],
  );
  const [activeChartId, setActiveChartId] = useState<'savings' | 'global'>(() => (savingsRepartition ? 'savings' : 'global'));
  const savingsBelowFloorWarning = useMemo(() => {
    if (!autoSavingsBreakdown) return null;
    if (autoSavingsBreakdown.locked) return null;
    if (autoSavingsBreakdown.belowFloorCents <= 0) return null;
    return autoSavingsBreakdown;
  }, [autoSavingsBreakdown]);
  const [savingsFloorWarningOpen, setSavingsFloorWarningOpen] = useState(false);
  const [dismissedSavingsFloorWarningKey, setDismissedSavingsFloorWarningKey] = useState<string | null>(null);
  const savingsFloorWarningKey = useMemo(() => {
    if (!savingsBelowFloorWarning) return null;
    return [
      ym,
      savingsBelowFloorWarning.floorCents,
      savingsBelowFloorWarning.currentCents,
      savingsBelowFloorWarning.requiredWithoutSavingsCents,
      savingsBelowFloorWarning.salaryCents,
      savingsBelowFloorWarning.shortfallAfterZeroCents,
    ].join(':');
  }, [savingsBelowFloorWarning, ym]);
  useEffect(() => {
    if (!savingsFloorWarningKey) {
      setSavingsFloorWarningOpen(false);
      setDismissedSavingsFloorWarningKey(null);
      return;
    }
    if (dismissedSavingsFloorWarningKey === savingsFloorWarningKey) return;
    setSavingsFloorWarningOpen(true);
  }, [dismissedSavingsFloorWarningKey, savingsFloorWarningKey]);
  const dismissSavingsFloorWarning = () => {
    setSavingsFloorWarningOpen(false);
    if (savingsFloorWarningKey) setDismissedSavingsFloorWarningKey(savingsFloorWarningKey);
  };
  useEffect(() => {
    if (chartSlides.includes(activeChartId)) return;
    setActiveChartId(chartSlides[0]);
  }, [activeChartId, chartSlides]);
  const activeSlideIndex = Math.max(0, chartSlides.indexOf(activeChartId));
  const canCycleCharts = chartSlides.length > 1;

  return (
    <section
      data-tour="summary"
      className="fm-panel motion-hover motion-pop p-4 max-[360px]:p-3 sm:p-6 lg:sticky lg:top-32 lg:max-h-[calc(100dvh_-_8rem)] lg:overflow-auto"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-300">Résumé</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-shadow-2xs">Totaux</h2>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cx(
              'rounded-full px-3 py-1 text-xs',
              totals.pendingCount ? 'bg-amber-400/10 text-amber-200' : 'bg-emerald-400/10 text-emerald-200',
            )}
          >
            {totals.pendingCount ? `${totals.pendingCount} à cocher` : 'Tout coché'}
          </div>
          <button
            type="button"
            className="fm-mobile-section-toggle sm:hidden"
            onClick={() => setSummaryOpen((v) => !v)}
            aria-expanded={summaryOpen}
            aria-label={summaryOpen ? 'Masquer le résumé' : 'Afficher le résumé'}
            title={summaryOpen ? 'Masquer le résumé' : 'Afficher le résumé'}
          >
            <span>{summaryOpen ? 'Replier' : 'Voir'} résumé</span>
            <span aria-hidden="true" className="fm-mobile-section-toggle-icon">
              {summaryOpen ? '−' : '+'}
            </span>
          </button>
          <button
            type="button"
            className="fm-btn-ghost hidden h-8 w-10 items-center justify-center text-xs font-medium text-slate-200 sm:flex"
            onClick={() => setSummaryOpen((v) => !v)}
            aria-expanded={summaryOpen}
            aria-label={summaryOpen ? 'Masquer le résumé' : 'Afficher le résumé'}
            title={summaryOpen ? 'Masquer le résumé' : 'Afficher le résumé'}
          >
            <span aria-hidden="true" className="text-[18px] font-semibold leading-none">
              {summaryOpen ? '▴' : '▾'}
            </span>
          </button>
        </div>
      </div>

      <div className={cx(!summaryOpen && 'hidden')}>
        <div className="mt-6 space-y-3 max-[360px]:mt-4">
          <label className="grid gap-1">
            <div className="text-xs text-slate-400">Salaire</div>
            <div className="relative">
              <input
                className="fm-input h-10 rounded-2xl px-4 text-base sm:text-sm"
                type="text"
                inputMode="decimal"
                value={salaryDraft}
                onChange={(e) => {
                  setSalaryDraft(e.target.value);
                  setSalaryEditing(true);
                }}
                onBlur={() => {
                  setSalaryEditing(false);
                  const euros = salaryDraft.trim() === '' ? 0 : parseEuroAmount(salaryDraft);
                  if (euros === null || euros < 0) {
                    setSalaryDraft(String(centsToEuros(totals.salaryCents)));
                    return;
                  }
                  const next = eurosToCents(euros);
                  if (next !== totals.salaryCents) dispatch({ type: 'SET_SALARY', ym, salaryCents: next });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    setSalaryDraft(String(centsToEuros(totals.salaryCents)));
                    setSalaryEditing(false);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                aria-label="Salaire"
              />
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-slate-400">€</div>
            </div>
          </label>

          {autoSavingsBreakdown && autoSavingsBreakdown.surplusCents > 0 ? (
            <div className="rounded-2xl border border-emerald-300/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.22),rgba(6,78,59,0.2))] px-4 py-3 shadow-[0_20px_48px_-28px_rgba(16,185,129,0.95)]">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100/90">Surplus épargne</div>
              <div className="mt-1 flex items-end justify-between gap-3">
                <div className="text-sm font-medium leading-tight text-emerald-100">Ajout automatique ce mois</div>
                <div className="text-2xl font-semibold tabular-nums text-emerald-50">+{formatEUR(autoSavingsBreakdown.surplusCents)}</div>
              </div>
              <div className="mt-1 text-[11px] text-emerald-100/90">
                Épargne: {formatEUR(autoSavingsBreakdown.floorCents)} → {formatEUR(autoSavingsBreakdown.currentCents)}
                {autoSavingsBreakdown.locked ? ' (figée: charge cochée)' : ''}
              </div>
            </div>
          ) : null}
          {savingsBelowFloorWarning ? (
            <div className="rounded-2xl border border-amber-300/35 bg-[linear-gradient(135deg,rgba(251,191,36,0.2),rgba(146,64,14,0.18))] px-4 py-3 shadow-[0_20px_48px_-28px_rgba(245,158,11,0.8)]">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-100/90">Alerte épargne</div>
              <div className="mt-1 flex items-end justify-between gap-3">
                <div className="text-sm font-medium leading-tight text-amber-100">Montant réduit sous le plancher</div>
                <div className="text-2xl font-semibold tabular-nums text-amber-50">-{formatEUR(savingsBelowFloorWarning.belowFloorCents)}</div>
              </div>
              <div className="mt-1 text-[11px] text-amber-100/90">
                Épargne: {formatEUR(savingsBelowFloorWarning.floorCents)} → {formatEUR(savingsBelowFloorWarning.currentCents)}
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className="rounded-xl border border-amber-100/25 bg-amber-100/15 px-3 py-1.5 text-[11px] font-semibold text-amber-50 transition-colors hover:bg-amber-100/20"
                  onClick={() => setSavingsFloorWarningOpen(true)}
                >
                  Voir le détail
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Row label="Charges hors épargne" value={formatEUR(chargesWithoutSavingsCents)} strong />
            <Row label="Enveloppes cibles" value={formatEUR(totals.totalBudgetsBaseCents)} />
            {reliquatDebtImpactCents > 0 ? (
              <Row
                label="Dette entrante ajoutée (enveloppes)"
                value={formatEUR(reliquatDebtImpactCents)}
                rowClassName="fm-reliquat-negative"
                tone="negative"
              />
            ) : null}
            {reliquatCreditImpactCents > 0 ? (
              <Row
                label="Reliquat positif à déduire (enveloppes)"
                value={formatEUR(reliquatCreditImpactCents)}
                rowClassName="fm-reliquat-positive"
                tone="positive"
              />
            ) : null}
            <Row label="Enveloppes à virer (ma part)" value={formatEUR(totals.totalBudgetsCents)} strong />
            {budgetsInvariantDeltaCents !== 0 ? (
              <div className="fm-reliquat-negative rounded-xl border px-3 py-2 text-xs">
                Incohérence enveloppes: somme cartes ({formatEUR(budgetsCardsComputedCents)}) vs total enveloppes à virer (
                {formatEUR(totals.totalBudgetsCents)}).
              </div>
            ) : null}
            {autoSavingsBreakdown ? (
              <Row
                label="Épargne du mois"
                value={formatEUR(autoSavingsBreakdown.currentCents)}
                strong
                valueClassName="text-emerald-200"
              />
            ) : null}
          </div>
        </div>

        <div className="fm-card mt-6 overflow-hidden p-4 max-[360px]:mt-4 max-[360px]:p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-200">
                {activeChartId === 'savings' ? 'Répartition épargne' : 'Répartition'}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {activeChartId === 'savings'
                  ? savingsRepartition?.locked
                    ? 'Montant figé (charge cochée)'
                    : savingsRepartition?.bonusCreditSurplusCents
                      ? 'Base + surplus structurel + bonus reliquat'
                      : 'Base + surplus automatique'
                  : repartition.label}
              </div>
            </div>
            <div className="grid grid-cols-[84px_64px] items-start gap-2">
              <div className="w-[84px] text-right">
                <div className="text-xs font-semibold tabular-nums text-slate-200">
                  {activeChartId === 'savings' ? formatEUR(savingsRepartition?.totalCents ?? 0) : formatEUR(repartition.baseCents)}
                </div>
                <div className="text-[11px] text-slate-400">{activeChartId === 'savings' ? 'total épargne' : 'base'}</div>
              </div>
              <div className="flex h-7 items-center justify-end gap-1">
                {canCycleCharts ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[11px] text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
                      onClick={() =>
                        setActiveChartId(chartSlides[(activeSlideIndex - 1 + chartSlides.length) % chartSlides.length])
                      }
                      aria-label="Graphique précédent"
                      title="Graphique précédent"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[11px] text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
                      onClick={() =>
                        setActiveChartId(chartSlides[(activeSlideIndex + 1) % chartSlides.length])
                      }
                      aria-label="Graphique suivant"
                      title="Graphique suivant"
                    >
                      ›
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            {activeChartId === 'savings' && savingsRepartition ? (
              <>
                <DonutChart
                  ariaLabel="Répartition de l'épargne"
                  segments={savingsRepartition.segments}
                  total={Math.max(savingsRepartition.totalCents, 1)}
                  activeSegmentId={activeSavingsSegId}
                  onActiveSegmentIdChange={setActiveSavingsSegId}
                  className="motion-hover mx-auto"
                  centerContainerClassName="-translate-y-4"
                  centerTop={savingsCenterTop}
                  centerBottom={savingsCenterBottom}
                  centerBottomClassName={savingsCenterTone}
                  centerHint={savingsCenterHint}
                  centerHintClassName="max-w-[132px] tabular-nums"
                />
                <div className="min-w-0 space-y-2">
                  {savingsRepartition.segments.map((s) => (
                    <LegendRow
                      key={s.id}
                      label={s.label}
                      valueCents={s.value}
                      color={s.color}
                      baseCents={Math.max(savingsRepartition.totalCents, 1)}
                      active={activeSavingsSegId === s.id}
                      onActivate={() => setActiveSavingsSegId(s.id)}
                      onDeactivate={() => setActiveSavingsSegId(null)}
                    />
                  ))}
                  {!savingsRepartition.hasSurplus ? (
                    <div className="text-xs text-slate-400">Pas de surplus ce mois (épargne au montant de base).</div>
                  ) : null}
                  {savingsRepartition.debtImpactCents > 0 ? (
                    <div className="fm-reliquat-negative rounded-lg border px-2 py-1 text-[11px]">
                      Dette entrante absorbée avant surplus: {formatEUR(savingsRepartition.debtImpactCents)}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <DonutChart
                  ariaLabel="Répartition du budget"
                  segments={repartition.segments}
                  total={repartition.baseCents}
                  activeSegmentId={activeSegId}
                  onActiveSegmentIdChange={setActiveSegId}
                  className="motion-hover mx-auto"
                  centerContainerClassName="-translate-y-4"
                  centerTop={centerTop}
                  centerBottom={centerBottom}
                  centerBottomClassName={centerTone}
                />

                <div className="min-w-0 space-y-2">
                  {repartition.segments.map((s) => (
                    <LegendRow
                      key={s.id}
                      label={s.label}
                      valueCents={s.value}
                      color={s.color}
                      baseCents={repartition.baseCents}
                      active={activeSegId === s.id}
                      onActivate={() => setActiveSegId(s.id)}
                      onDeactivate={() => setActiveSegId(null)}
                    />
                  ))}
                  {repartition.segments.length === 0 ? <div className="text-sm text-slate-400">Aucune donnée.</div> : null}
                </div>
              </>
            )}
          </div>
          {canCycleCharts ? (
            <div className="mt-3 flex items-center justify-center gap-2">
              {chartSlides.map((id, idx) => (
                <button
                  key={id}
                  type="button"
                  className={cx(
                    'h-1.5 rounded-full border border-white/10 transition-all',
                    activeSlideIndex === idx ? 'w-5 bg-slate-200/80' : 'w-1.5 bg-white/20 hover:bg-white/35',
                  )}
                  onClick={() => setActiveChartId(id)}
                  aria-label={`Aller au graphique ${idx + 1}`}
                  title={`Graphique ${idx + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-8 max-[360px]:mt-6">
          <div className="text-sm font-medium text-slate-200 text-shadow-2xs">Par compte (montant à approvisionner)</div>
          {accountSummaryDeltaCents !== 0 ? (
            <div className="mt-2 rounded-lg border border-rose-300/30 bg-rose-500/12 px-3 py-2 text-xs text-rose-100">
              Incohérence détectée: total par compte ({formatEUR(totalByAccountCents)}) vs total à provisionner ({formatEUR(totals.totalProvisionCents)}).
            </div>
          ) : null}
          {hasUnknownAccountSummaryRow ? (
            <div className="mt-2 rounded-lg border border-amber-300/30 bg-amber-500/12 px-3 py-2 text-xs text-amber-100">
              Certains montants pointent vers un identifiant de compte non configuré. Ils restent inclus dans les totaux.
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {byAccount.map((a) => {
              const meta = chargesByAccount.get(a.accountId) ?? null;
              const allPaid = Boolean(meta && meta.ids.length > 0 && meta.unpaidCount === 0);
              const unpaidCount = meta?.unpaidCount ?? 0;
              const canMarkAll = !archived && Boolean(meta && meta.unpaidCount > 0);
              const hasBudgets = a.budgetsBaseCents !== 0 || a.budgetsCarryOverCents !== 0 || a.budgetsCents !== 0;
              const bulkLabel = (() => {
                if (archived) return 'Mois archivé';
                if (!meta || meta.ids.length === 0) return 'Aucune charge à cocher';
                if (meta.unpaidCount === 0) return 'Tout est déjà coché';
                return `Cocher toutes les charges liées à ${a.accountName}`;
              })();
              return (
                <button
                  key={a.accountId}
                  type="button"
                  className={cx(
                    'fm-account-summary-card text-left',
                    canMarkAll ? 'fm-account-summary-card-clickable' : 'opacity-85',
                    allPaid && 'opacity-75',
                  )}
                  disabled={!canMarkAll}
                  title={bulkLabel}
                  aria-label={bulkLabel}
                  onClick={() => {
                    if (!canMarkAll || !meta) return;
                    dispatch({ type: 'SET_CHARGES_PAID', ym, chargeIds: meta.ids, paid: true });
                  }}
                >
                  <div className="fm-account-summary-head">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="min-w-0 wrap-break-word text-[15px] font-semibold leading-tight text-slate-100 text-shadow-2xs">
                          {a.accountName}
                        </div>
                        <span
                          className={cx(
                            'fm-chip-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                            a.kind === 'commun' ? 'border-sky-200/30 bg-sky-400/15 text-sky-50' : 'border-emerald-200/30 bg-emerald-400/15 text-emerald-50',
                          )}
                        >
                          {a.kind}
                        </span>
                        {allPaid ? (
                          <span className="fm-chip-pill border-emerald-200/25 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
                            OK ✓
                          </span>
                        ) : null}
                        {!a.isKnownAccount ? (
                          <span className="fm-chip-pill border-amber-300/30 bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                            hors liste
                          </span>
                        ) : null}
                      </div>

                      {a.accountName !== a.accountId ? (
                        <div className="mt-1 wrap-anywhere font-mono text-[11px] text-slate-400">{a.accountId}</div>
                      ) : null}

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {unpaidCount > 0 ? (
                          <span className="fm-chip-pill border-amber-200/30 bg-amber-400/12 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                            {unpaidCount} à cocher
                          </span>
                        ) : null}
                        {canMarkAll ? (
                          <span className="fm-chip-pill px-2 py-0.5 text-[10px] text-slate-300">Appui pour tout cocher</span>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className={cx(
                        'fm-account-summary-total',
                        a.kind === 'commun'
                          ? 'border-sky-200/30 bg-sky-400/12 text-sky-200'
                          : 'border-emerald-200/30 bg-emerald-400/12 text-emerald-200',
                      )}
                    >
                      {formatEUR(a.totalCents)}
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <AccountMetric label="Charges à provisionner" value={formatEUR(a.chargesTotalCents)} />
                    <AccountMetric label="Charges cochées" value={formatEUR(a.chargesPaidCents)} />
                    {hasBudgets ? <AccountMetric label="Enveloppes à virer" value={formatEUR(a.budgetsCents)} /> : null}
                    {hasBudgets ? <AccountMetric label="Enveloppes cibles" value={formatEUR(a.budgetsBaseCents)} /> : null}
                    {a.budgetsCarryOverCents !== 0 ? (
                      <AccountMetric
                        label="Impact reliquat"
                        value={formatSignedCents(a.budgetsCarryOverCents)}
                        rowClassName={a.budgetsCarryOverCents > 0 ? 'fm-reliquat-negative' : 'fm-reliquat-positive'}
                      />
                    ) : null}
                  </div>
                </button>
              );
            })}
            {byAccount.length === 0 ? <div className="text-sm text-slate-400">Aucune charge ce mois-ci.</div> : null}
          </div>
        </div>

        <details className="fm-card mt-6 p-4 max-[360px]:mt-4 max-[360px]:p-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-slate-200">Comptes</summary>
          <div className="mt-3 space-y-2">
            <AccountsEditor />
          </div>
        </details>
      </div>
      {savingsBelowFloorWarning ? (
        <SavingsFloorWarningModal
          open={savingsFloorWarningOpen}
          onClose={dismissSavingsFloorWarning}
          floorCents={savingsBelowFloorWarning.floorCents}
          currentCents={savingsBelowFloorWarning.currentCents}
          belowFloorCents={savingsBelowFloorWarning.belowFloorCents}
          salaryCents={savingsBelowFloorWarning.salaryCents}
          requiredWithoutSavingsCents={savingsBelowFloorWarning.requiredWithoutSavingsCents}
          shortfallAfterZeroCents={savingsBelowFloorWarning.shortfallAfterZeroCents}
        />
      ) : null}
      </section>
    );
}

function SavingsFloorWarningModal({
  open,
  onClose,
  floorCents,
  currentCents,
  belowFloorCents,
  salaryCents,
  requiredWithoutSavingsCents,
  shortfallAfterZeroCents,
}: {
  open: boolean;
  onClose: () => void;
  floorCents: number;
  currentCents: number;
  belowFloorCents: number;
  salaryCents: number;
  requiredWithoutSavingsCents: number;
  shortfallAfterZeroCents: number;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const prevActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevActiveRef.current = (document.activeElement as HTMLElement | null) ?? null;
    window.requestAnimationFrame(() => {
      const root = dialogRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      (first ?? root).focus();
    });
    return () => {
      prevActiveRef.current?.focus?.();
      prevActiveRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" aria-label="Fermer l'alerte" className="absolute inset-0 bg-black/72" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Alerte réduction épargne"
        className="relative w-[min(100%,460px)] rounded-3xl border border-amber-300/35 bg-ink-950/96 p-5 shadow-[0_22px_90px_-40px_rgba(0,0,0,0.95)]"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
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
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">Alerte</div>
            <h3 className="mt-1 text-base font-semibold text-amber-50">Épargne réduite sous le plancher</h3>
          </div>
          <button
            type="button"
            className="rounded-xl border border-amber-100/20 bg-amber-100/10 px-3 py-1.5 text-xs text-amber-100 transition-colors hover:bg-amber-100/15"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="mt-3 space-y-2 text-sm text-amber-50/95">
          <p>
            Les enveloppes du mois consomment plus de marge que prévu. L'épargne auto est donc abaissée pour garder un calcul cohérent.
          </p>
          <div className="rounded-2xl border border-amber-100/20 bg-amber-100/8 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span>Épargne configurée</span>
              <span className="font-semibold tabular-nums">{formatEUR(floorCents)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span>Épargne recalculée</span>
              <span className="font-semibold tabular-nums">{formatEUR(currentCents)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span>Réduction appliquée</span>
              <span className="font-semibold tabular-nums">-{formatEUR(belowFloorCents)}</span>
            </div>
            <div className="mt-2 h-px bg-amber-100/15" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span>Salaire du mois</span>
              <span className="font-semibold tabular-nums">{formatEUR(salaryCents)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span>Charges + enveloppes (hors épargne)</span>
              <span className="font-semibold tabular-nums">{formatEUR(requiredWithoutSavingsCents)}</span>
            </div>
          </div>
          {shortfallAfterZeroCents > 0 ? (
            <div className="rounded-xl border border-rose-300/35 bg-rose-500/12 px-3 py-2 text-xs text-rose-100">
              Même avec une épargne à 0, il manque encore {formatEUR(shortfallAfterZeroCents)} sur le mois.
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-2xl border border-amber-100/25 bg-amber-100/15 px-4 py-2 text-sm font-semibold text-amber-50 transition-colors hover:bg-amber-100/20"
            onClick={onClose}
          >
            Compris
          </button>
        </div>
      </div>
    </div>
  );
}

  function AccountsEditor() {
    const { state, dispatch } = useStoreState();
    const activeAccounts = state.accounts.filter((a) => a.active);
    const inactiveAccounts = state.accounts.filter((a) => !a.active);
    const [addDraft, setAddDraft] = useState<{ rawId: string; kind: Account['kind'] }>({
      rawId: '',
      kind: 'perso',
    });
    const [removeDraft, setRemoveDraft] = useState<{ accountId: Account['id']; moveToAccountId: Account['id'] } | null>(null);

  const baseSelect = 'fm-input-select h-8 px-2 text-[11px] font-semibold uppercase tracking-wide shadow-inner shadow-black/20';
  const addId = addDraft.rawId
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
  const addExists = Boolean(addId && state.accounts.some((a) => a.id === addId));

  return (
    <div className="space-y-2">
      <div className="fm-card-soft p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ajouter un compte</div>
        <div className="mt-2 grid gap-2">
            <input
            className="fm-input h-8 px-3 text-[13px] font-semibold"
            placeholder="ex: BOURSO_PERSO"
            value={addDraft.rawId}
            onChange={(e) => setAddDraft((s) => ({ ...s, rawId: e.target.value }))}
            aria-label="ID du compte"
          />
          <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
            <select
              className={baseSelect}
              value={addDraft.kind}
              onChange={(e) => setAddDraft((s) => ({ ...s, kind: e.target.value as Account['kind'] }))}
              aria-label="Type du compte"
            >
              <option value="perso">Perso</option>
              <option value="commun">Commun</option>
            </select>
            <button
              type="button"
              className={cx(
                'fm-btn-soft h-8 w-full px-3 text-[11px]',
                !addId && 'opacity-50 hover:bg-slate-400/12',
              )}
              disabled={!addId}
              onClick={() => {
                if (!addId) return;
                dispatch({ type: 'ADD_ACCOUNT', accountId: addId, kind: addDraft.kind });
                setAddDraft({ rawId: '', kind: addDraft.kind });
              }}
            >
              {addExists ? 'Restaurer' : 'Ajouter'}
            </button>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">Astuce: espaces → “_”, tout est mis en majuscules.</div>
      </div>

        {activeAccounts.map((a) => {
          const moveTargets = activeAccounts.filter((x) => x.id !== a.id);
          const canRemove = moveTargets.length > 0;
          const removing = removeDraft?.accountId === a.id;
          const activeRemove = removing ? removeDraft : null;

          return (
            <div key={a.id} className="fm-card-soft px-3 py-2">
              <div className="grid gap-3 sm:flex sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <InlineTextInput
                    ariaLabel={`Nom du compte: ${a.id}`}
                    value={a.name}
                    disabled={false}
                      className="fm-input h-8 px-3 text-[13px] font-semibold ring-0"
                    onCommit={(name) => {
                      const nextName = name.trim() || a.id;
                      if (nextName === a.name) return;
                      dispatch({ type: 'UPDATE_ACCOUNT', accountId: a.id, patch: { name: nextName } });
                    }}
                  />
                  <div className="mt-1 min-w-0 truncate text-[11px] text-slate-400">
                    ID: <span className="font-mono">{a.id}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
                  <select
                    className={cx(baseSelect, 'h-9 w-full sm:h-8 sm:w-auto')}
                    value={a.kind}
                    onChange={(e) =>
                      dispatch({ type: 'UPDATE_ACCOUNT', accountId: a.id, patch: { kind: e.target.value as Account['kind'] } })
                    }
                    aria-label={`Type du compte: ${a.id}`}
                  >
                    <option value="perso">Perso</option>
                    <option value="commun">Commun</option>
                  </select>
                  <button
                    type="button"
                    className={cx(
                      'fm-btn-ghost h-9 w-full px-3 text-[11px] font-semibold text-rose-100 sm:h-8 sm:w-auto',
                      !canRemove && 'opacity-40 hover:bg-white/7',
                    )}
                    disabled={!canRemove}
                    title={canRemove ? 'Supprimer ce compte' : 'Impossible de supprimer le dernier compte actif.'}
                    aria-label={`Supprimer le compte: ${a.id}`}
                    onClick={() => {
                      if (!canRemove) return;
                      setRemoveDraft({ accountId: a.id, moveToAccountId: moveTargets[0]!.id });
                    }}
                  >
                    Suppr
                  </button>
                </div>
            </div>

              {removing && activeRemove ? (
              <div className="fm-card-soft mt-3 flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="text-xs text-slate-300">Déplacer charges/budgets vers</div>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                      className={cx(baseSelect, 'h-9')}
                      value={activeRemove.moveToAccountId}
                      onChange={(e) =>
                        setRemoveDraft((cur) => (cur ? { ...cur, moveToAccountId: e.target.value as Account['id'] } : cur))
                      }
                      aria-label="Compte cible"
                    >
                      {moveTargets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name && t.name !== t.id ? `${t.name} (${t.id})` : t.id}
                        </option>
                      ))}
                    </select>
                  <button
                    type="button"
                    className="fm-btn-soft h-9 rounded-2xl px-4 text-sm"
                    onClick={() => {
                      dispatch({ type: 'REMOVE_ACCOUNT', accountId: a.id, moveToAccountId: activeRemove.moveToAccountId });
                      setRemoveDraft(null);
                    }}
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    className="fm-btn-ghost h-9 rounded-2xl px-4 text-sm text-slate-200"
                    onClick={() => setRemoveDraft(null)}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

        {inactiveAccounts.length ? (
          <details className="fm-card mt-3 px-3 py-2">
            <summary className="cursor-pointer select-none text-sm font-medium text-slate-300">Comptes supprimés</summary>
            <div className="mt-3 space-y-2">
              {inactiveAccounts.map((a) => (
                <div key={a.id} className="fm-card-soft grid gap-2 px-3 py-2 sm:flex sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-200">{a.name || a.id}</div>
                    {a.name && a.name !== a.id ? (
                      <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{a.id}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="fm-btn-ghost h-9 w-full px-3 text-[11px] font-semibold sm:h-8 sm:w-auto"
                    onClick={() => dispatch({ type: 'UPDATE_ACCOUNT', accountId: a.id, patch: { active: true } })}
                    aria-label={`Restaurer le compte: ${a.id}`}
                  >
                    Restaurer
                  </button>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    );
  }

function LegendRow({
  label,
  valueCents,
  color,
  baseCents,
  active,
  onActivate,
  onDeactivate,
}: {
  label: string;
  valueCents: number;
  color: string;
  baseCents: number;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const pct = baseCents > 0 ? Math.round((valueCents / baseCents) * 100) : 0;
  const amount = formatEUR(valueCents).replace(/\s/g, '');
  return (
    <button
      type="button"
      className={cx(
        'flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition-colors',
        active ? 'border-white/25 bg-white/10' : 'border-white/10 bg-ink-950/20 hover:bg-white/7',
      )}
      aria-pressed={active}
      aria-label={`${label}: ${pct}% (${formatEUR(valueCents)})`}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
    >
      <div className="min-w-0 flex items-center gap-2 text-xs text-slate-200">
        <span
          className="h-3 w-3 flex-none rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_0_0_2px_rgba(255,255,255,0.14)]"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-xs font-semibold tabular-nums text-slate-100">{pct}%</div>
        <div className="text-[11px] tabular-nums text-slate-300/80">{amount}</div>
      </div>
    </button>
  );
}

function Row({
  label,
  value,
  strong,
  valueClassName,
  rowClassName,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClassName?: string;
  rowClassName?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const labelClass = (() => {
    if (tone === 'negative') return 'text-rose-100';
    if (tone === 'positive') return 'text-emerald-100';
    return strong ? 'text-slate-200' : 'text-slate-400';
  })();
  const valueClass = (() => {
    if (tone === 'negative') return 'text-rose-200';
    if (tone === 'positive') return 'text-emerald-200';
    return strong ? 'font-semibold text-slate-100' : 'text-slate-200';
  })();
  return (
    <div className={cx('fm-stat-row', rowClassName)}>
      <div className={cx('fm-stat-label', labelClass)}>
        {label}
      </div>
      <div
        className={cx(
          'fm-stat-value',
          valueClass,
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function AccountMetric({
  label,
  value,
  rowClassName,
  valueClassName,
}: {
  label: string;
  value: string;
  rowClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cx('fm-account-summary-metric', rowClassName)}>
      <span className="fm-account-summary-metric-label">{label}</span>
      <span className={cx('fm-account-summary-metric-value', valueClassName)}>{value}</span>
    </div>
  );
}

function formatSignedCents(cents: number) {
  if (cents === 0) return formatEUR(0);
  const sign = cents > 0 ? '+' : '-';
  return `${sign}${formatEUR(Math.abs(cents))}`;
}
