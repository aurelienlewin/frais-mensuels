import { useState } from 'react';
import { centsToEuros, eurosToCents, formatEUR } from '../lib/money';
import { totalsByAccount, totalsForMonth } from '../state/selectors';
import { useStore } from '../state/store';
import type { YM } from '../lib/date';
import { cx } from './cx';
import { DonutChart, type DonutSegment } from './components/DonutChart';
import { InlineTextInput } from './components/InlineInput';
import type { Account } from '../state/types';

export function SummaryPanel({ ym }: { ym: YM }) {
  const { state, dispatch } = useStore();
  const totals = totalsForMonth(state, ym);
  const byAccount = totalsByAccount(state, ym);

  const ratio =
    totals.salaryCents > 0 ? Math.min(1, Math.max(0, totals.totalPourMoiAvecEnveloppesCents / totals.salaryCents)) : 0;

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
          ? 'text-fuchsia-200'
          : activeSeg?.id === 'remaining'
            ? 'text-slate-200'
            : repartition.remainingCents < 0
              ? 'text-rose-200'
              : 'text-emerald-200';

  return (
    <section
      data-tour="summary"
      className="motion-hover motion-pop rounded-3xl border border-white/15 bg-ink-950/60 p-4 shadow-[0_12px_40px_-30px_rgba(0,0,0,0.85)] sm:p-6 lg:sticky lg:top-32 lg:max-h-[calc(100dvh-8rem)] lg:overflow-auto"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-300">Résumé</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Totaux</h2>
        </div>
        <div className={cx('rounded-full px-3 py-1 text-xs', totals.pendingCount ? 'bg-amber-400/10 text-amber-200' : 'bg-emerald-400/10 text-emerald-200')}>
          {totals.pendingCount ? `${totals.pendingCount} à cocher` : 'Tout coché'}
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        <label className="grid gap-1">
          <div className="text-xs text-slate-400">Salaire</div>
          <div className="relative">
            <input
              className="h-10 w-full rounded-2xl border border-white/15 bg-white/7 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-200/40 focus:bg-white/10"
              type="number"
              inputMode="decimal"
              step={0.01}
              value={String(centsToEuros(totals.salaryCents))}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                dispatch({ type: 'SET_SALARY', salaryCents: eurosToCents(n) });
              }}
              aria-label="Salaire"
            />
            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-slate-400">€</div>
          </div>
        </label>

	        <div className="mt-2 grid gap-2">
	          <Row label="Charges communes (total)" value={formatEUR(totals.totalCommunCents)} />
	          <Row label="Ma part (commun)" value={formatEUR(totals.totalCommunPartCents)} />
	          <Row label="Charges perso" value={formatEUR(totals.totalPersoCents)} />
	          <div className="my-2 h-px bg-white/10" />
	          <Row label="Total charges (pour moi)" value={formatEUR(totals.totalPourMoiCents)} strong />
	          <Row label="Enveloppes (budgets)" value={formatEUR(totals.totalBudgetsCents)} />
          <Row label="Total (charges + enveloppes)" value={formatEUR(totals.totalPourMoiAvecEnveloppesCents)} strong />
          <Row
            label="Reste à vivre (après enveloppes)"
            value={formatEUR(totals.resteAVivreApresEnveloppesCents)}
            strong
            valueClassName={totals.resteAVivreApresEnveloppesCents < 0 ? 'text-rose-200' : 'text-emerald-200'}
          />
        </div>

        <div className="mt-4">
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
            <div className="h-full rounded-full bg-emerald-400/70" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-white/15 bg-white/7 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-200">Répartition</div>
            <div className="mt-0.5 text-xs text-slate-400">{repartition.label}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold tabular-nums text-slate-200">{formatEUR(repartition.baseCents)}</div>
            <div className="text-[11px] text-slate-500">base</div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[132px_1fr]">
          <DonutChart
            ariaLabel="Répartition du budget"
            segments={repartition.segments}
            total={repartition.baseCents}
            activeSegmentId={activeSegId}
            onActiveSegmentIdChange={setActiveSegId}
            className="motion-hover"
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

      <div className="mt-8">
          <div className="text-sm font-medium text-slate-200">Par compte</div>
        <div className="mt-3 space-y-2">
          {byAccount.map((a) => (
            <div key={a.accountId} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/15 bg-white/7 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-100" title={a.accountName}>
                  {a.accountName}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-400">
                  {formatEUR(a.paidCents)} / {formatEUR(a.totalCents)} cochés
                </div>
              </div>
              <div className={cx('flex-none text-sm font-medium tabular-nums', a.kind === 'commun' ? 'text-sky-200' : 'text-slate-200')}>
                {formatEUR(a.totalCents)}
              </div>
            </div>
          ))}
	          {byAccount.length === 0 ? <div className="text-sm text-slate-400">Aucune charge ce mois-ci.</div> : null}
	        </div>
	      </div>

	      <details className="mt-6 rounded-3xl border border-white/15 bg-white/7 p-4">
	        <summary className="cursor-pointer select-none text-sm font-medium text-slate-200">Comptes</summary>
	        <div className="mt-3 space-y-2">
	          <AccountsEditor />
	        </div>
	      </details>
	    </section>
	  );
}

	function AccountsEditor() {
	  const { state, dispatch } = useStore();
	  const activeAccounts = state.accounts.filter((a) => a.active);
	  const inactiveAccounts = state.accounts.filter((a) => !a.active);
    const [addDraft, setAddDraft] = useState<{ rawId: string; kind: Account['kind'] }>({
      rawId: '',
      kind: 'perso',
    });
	  const [removeDraft, setRemoveDraft] = useState<{ accountId: Account['id']; moveToAccountId: Account['id'] } | null>(null);

  const baseSelect =
    'h-8 rounded-xl border border-white/15 bg-ink-950/35 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-100 shadow-inner shadow-black/20 outline-none transition-colors duration-150 focus:border-white/25 focus:bg-ink-950/45';
  const addId = addDraft.rawId
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
  const addExists = Boolean(addId && state.accounts.some((a) => a.id === addId));

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-white/10 bg-ink-950/35 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ajouter un compte</div>
        <div className="mt-2 grid gap-2">
          <input
            className="h-8 w-full rounded-xl border border-white/15 bg-white/7 px-3 text-[13px] font-semibold text-slate-100 outline-none placeholder:text-slate-500 focus:border-fuchsia-200/40 focus:bg-white/10"
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
                'h-8 w-full rounded-xl border border-fuchsia-200/25 bg-fuchsia-400/12 px-3 text-[11px] font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/18',
                !addId && 'opacity-50 hover:bg-fuchsia-400/12',
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
        <div className="mt-2 text-[11px] text-slate-500">Astuce: espaces → “_”, tout est mis en majuscules.</div>
      </div>

	      {activeAccounts.map((a) => {
	        const moveTargets = activeAccounts.filter((x) => x.id !== a.id);
	        const canRemove = moveTargets.length > 0;
	        const removing = removeDraft?.accountId === a.id;
	        const activeRemove = removing ? removeDraft : null;

	        return (
	          <div key={a.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
	            <div className="flex items-center gap-3">
	              <div className="min-w-0 flex-1">
                  <InlineTextInput
                    ariaLabel={`Nom du compte: ${a.id}`}
                    value={a.name}
                    disabled={false}
                    className="h-8 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-[13px] font-semibold text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-white/15 focus:bg-white/10"
                    onCommit={(name) => {
                      const nextName = name.trim() || a.id;
                      if (nextName === a.name) return;
                      dispatch({ type: 'UPDATE_ACCOUNT', accountId: a.id, patch: { name: nextName } });
                    }}
                  />
                  <div className="mt-1 min-w-0 truncate text-[11px] text-slate-500">
                    ID: <span className="font-mono">{a.id}</span>
                  </div>
	              </div>
	              <select
	                className={baseSelect}
	                value={a.kind}
	                onChange={(e) => dispatch({ type: 'UPDATE_ACCOUNT', accountId: a.id, patch: { kind: e.target.value as Account['kind'] } })}
	                aria-label={`Type du compte: ${a.id}`}
	              >
	                <option value="perso">Perso</option>
	                <option value="commun">Commun</option>
	              </select>
              <button
                type="button"
                className={cx(
                  'h-8 rounded-xl border border-white/15 bg-white/7 px-3 text-[11px] font-semibold text-rose-100 transition-colors hover:bg-rose-400/15',
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

	            {removing && activeRemove ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-ink-950/35 p-3">
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
                    className="h-9 rounded-2xl border border-fuchsia-200/25 bg-fuchsia-400/12 px-4 text-sm font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/18"
                    onClick={() => {
                      dispatch({ type: 'REMOVE_ACCOUNT', accountId: a.id, moveToAccountId: activeRemove.moveToAccountId });
                      setRemoveDraft(null);
                    }}
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-2xl border border-white/15 bg-white/7 px-4 text-sm text-slate-200 transition-colors hover:bg-white/10"
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
        <details className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
          <summary className="cursor-pointer select-none text-sm font-medium text-slate-300">Comptes supprimés</summary>
          <div className="mt-3 space-y-2">
	            {inactiveAccounts.map((a) => (
	              <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
	                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-200">{a.name || a.id}</div>
                    {a.name && a.name !== a.id ? (
                      <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{a.id}</div>
                    ) : null}
	                </div>
	                <button
	                  type="button"
	                  className="h-8 rounded-xl border border-white/15 bg-white/7 px-3 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-white/10"
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
        active ? 'border-white/25 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/7',
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
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className={cx('text-sm', strong ? 'text-slate-200' : 'text-slate-400')}>{label}</div>
      <div className={cx('text-sm tabular-nums', strong ? 'font-semibold text-slate-100' : 'text-slate-200', valueClassName)}>{value}</div>
    </div>
  );
}
