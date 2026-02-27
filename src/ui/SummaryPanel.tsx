import { useEffect, useMemo, useState } from 'react';
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
    [state.accounts, state.charges, state.months, ym],
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

  const ratio =
    totals.salaryCents > 0 ? Math.min(1, Math.max(0, totals.totalPourMoiAvecEnveloppesCents / totals.salaryCents)) : 0;
  const reliquatDebtImpactCents = useMemo(
    () => budgets.reduce((acc, b) => acc + Math.max(0, b.carryOverMyShareCents), 0),
    [budgets],
  );
  const reliquatCreditImpactCents = useMemo(
    () => budgets.reduce((acc, b) => acc + Math.max(0, -b.carryOverMyShareCents), 0),
    [budgets],
  );
  const recomputedBudgetsToWireCents = totals.totalBudgetsBaseCents + reliquatDebtImpactCents - reliquatCreditImpactCents;
  const recomputedProvisionCents = totals.totalPourMoiCents + recomputedBudgetsToWireCents;

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
      ...(remaining > 0 ? [{ id: 'remaining', label: 'Disponible', value: remaining, color: 'rgb(226 232 240)' }] : []),
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

          <div className="fm-card-soft px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Total à provisionner ce mois</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-50">{formatEUR(totals.totalProvisionCents)}</div>
            <div className="mt-1 text-xs text-slate-400">
              {formatEUR(totals.totalPourMoiCents)} charges + {formatEUR(totals.totalBudgetsCents)} enveloppes à virer
            </div>
          </div>

          <div className="grid gap-2">
            <Row label="Charges à provisionner (pour moi)" value={formatEUR(totals.totalPourMoiCents)} strong />
            <Row label="Enveloppes cibles (ma part)" value={formatEUR(totals.totalBudgetsBaseCents)} />
            {reliquatDebtImpactCents > 0 ? (
              <Row
                label="Impact dette entrante (enveloppes)"
                value={formatSignedCents(reliquatDebtImpactCents)}
                valueClassName="text-rose-200"
                rowClassName="fm-reliquat-negative"
              />
            ) : null}
            {reliquatCreditImpactCents > 0 ? (
              <Row
                label="Impact reliquat positif (enveloppes)"
                value={formatSignedCents(-reliquatCreditImpactCents)}
                valueClassName="text-emerald-200"
                rowClassName="fm-reliquat-positive"
              />
            ) : null}
            <Row label="Enveloppes à virer (ma part)" value={formatEUR(totals.totalBudgetsCents)} strong />
            <Row label="Total à provisionner ce mois" value={formatEUR(totals.totalProvisionCents)} strong />
            <Row
              label="Reste à vivre (après enveloppes)"
              value={formatEUR(totals.resteAVivreApresEnveloppesCents)}
              strong
              valueClassName={totals.resteAVivreApresEnveloppesCents < 0 ? 'text-rose-200' : 'text-emerald-200'}
            />
          </div>
          <details className="group mt-2 rounded-xl border border-white/10 bg-ink-950/25 px-3 py-2 open:bg-ink-950/45">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-slate-200">
              <span>Détails du calcul</span>
              <span className="text-[11px] text-slate-400 transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-300">
              <div className="flex items-center justify-between gap-2">
                <span>Enveloppes cibles</span>
                <span className="tabular-nums text-slate-100">{formatEUR(totals.totalBudgetsBaseCents)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>+ Dette entrante</span>
                <span className="tabular-nums text-rose-200">{formatEUR(reliquatDebtImpactCents)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>- Reliquat positif</span>
                <span className="tabular-nums text-emerald-200">{formatEUR(reliquatCreditImpactCents)}</span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-center justify-between gap-2">
                <span>Enveloppes à virer</span>
                <span className="tabular-nums font-semibold text-sky-200">{formatEUR(recomputedBudgetsToWireCents)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Charges à provisionner</span>
                <span className="tabular-nums text-slate-100">{formatEUR(totals.totalPourMoiCents)}</span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-center justify-between gap-2">
                <span>Total à provisionner</span>
                <span className="tabular-nums font-semibold text-slate-50">{formatEUR(recomputedProvisionCents)}</span>
              </div>
            </div>
          </details>

          <div className="fm-card-soft px-4 py-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div>Charges + enveloppes / salaire</div>
              <div>{Math.round(ratio * 100)}%</div>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-label="Charges + enveloppes / salaire"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ratio * 100)}
            >
              <div
                className="h-full rounded-full bg-emerald-400/70 transition-[width] duration-300"
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="fm-card mt-6 overflow-hidden p-4 max-[360px]:mt-4 max-[360px]:p-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-200">Répartition</div>
              <div className="mt-0.5 text-xs text-slate-400">{repartition.label}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold tabular-nums text-slate-200">{formatEUR(repartition.baseCents)}</div>
              <div className="text-[11px] text-slate-400">base</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4">
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
          </div>
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
                    'fm-card min-w-0 px-4 py-3 text-left transition-colors',
                    canMarkAll ? 'hover:bg-white/10' : 'opacity-80',
                    allPaid && 'opacity-70',
                  )}
                  disabled={!canMarkAll}
                  title={bulkLabel}
                  aria-label={bulkLabel}
                  onClick={() => {
                    if (!canMarkAll || !meta) return;
                    dispatch({ type: 'SET_CHARGES_PAID', ym, chargeIds: meta.ids, paid: true });
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_132px] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 wrap-break-word text-sm font-semibold leading-tight text-slate-100">
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
                        <span className="fm-chip-pill-readable gap-1.5 px-2 py-0.5 text-[11px]">
                          <span className="text-slate-300">Charges:</span>
                          <span className="tabular-nums text-slate-100">{formatEUR(a.chargesTotalCents)}</span>
                        </span>
                        <span className="fm-chip-pill-readable gap-1.5 px-2 py-0.5 text-[11px]">
                          <span className="text-slate-300">Cochées:</span>
                          <span className="tabular-nums text-slate-100">{formatEUR(a.chargesPaidCents)}</span>
                        </span>
                        {hasBudgets ? (
                          <span className="fm-chip-pill-readable gap-1.5 px-2 py-0.5 text-[11px]">
                            <span className="text-slate-300">Env. à virer:</span>
                            <span className="tabular-nums text-slate-100">{formatEUR(a.budgetsCents)}</span>
                          </span>
                        ) : null}
                        {hasBudgets ? (
                          <span className="fm-chip-pill-readable gap-1.5 px-2 py-0.5 text-[11px]">
                            <span className="text-slate-300">Cible:</span>
                            <span className="tabular-nums text-slate-100">{formatEUR(a.budgetsBaseCents)}</span>
                          </span>
                        ) : null}
                        {a.budgetsCarryOverCents !== 0 ? (
                          <span
                            className={cx(
                              'fm-chip-pill-readable gap-1.5 px-2 py-0.5 text-[11px]',
                              a.budgetsCarryOverCents > 0 ? 'fm-reliquat-negative' : 'fm-reliquat-positive',
                            )}
                          >
                            <span>Impact reliquat:</span>
                            <span className="tabular-nums">{formatSignedCents(a.budgetsCarryOverCents)}</span>
                          </span>
                        ) : null}
                      </div>

                      {canMarkAll ? (
                        <div className="mt-1.5 text-[11px] text-slate-400">
                          Appui: cocher toutes les charges liées à ce compte.
                        </div>
                      ) : null}
                    </div>

                    <div className="sm:justify-self-end">
                      <div
                        className={cx(
                          'inline-flex rounded-xl px-3 py-1.5 text-sm font-semibold tabular-nums',
                          a.kind === 'commun' ? 'bg-sky-400/10 text-sky-200' : 'bg-emerald-400/10 text-emerald-200',
                        )}
                      >
                        {formatEUR(a.totalCents)}
                      </div>
                    </div>
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
      </section>
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
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClassName?: string;
  rowClassName?: string;
}) {
  return (
    <div className={cx('fm-stat-row', rowClassName)}>
      <div className={cx('fm-stat-label', strong ? 'text-slate-200' : 'text-slate-400')}>
        {label}
      </div>
      <div
        className={cx(
          'fm-stat-value',
          strong ? 'font-semibold text-slate-100' : 'text-slate-200',
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function formatSignedCents(cents: number) {
  if (cents === 0) return formatEUR(0);
  const sign = cents > 0 ? '+' : '-';
  return `${sign}${formatEUR(Math.abs(cents))}`;
}
