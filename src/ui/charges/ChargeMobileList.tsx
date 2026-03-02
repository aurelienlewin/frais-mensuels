import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { pad2 } from '../../lib/date';
import { centsToEuros, eurosToCents, formatEUR } from '../../lib/money';
import { chargesForMonth } from '../../state/selectors';
import type { Charge, ChargeScope } from '../../state/types';
import { cx } from '../cx';
import { InlineNumberInput, InlineTextInput } from '../components/InlineInput';

type ChargeRow = ReturnType<typeof chargesForMonth>[number];
type ChargeUpdatePatch = Partial<Omit<Charge, 'id' | 'active'>>;
type MovePos = 'before' | 'after';
type ActiveAccount = { id: Charge['accountId']; name: string; active: boolean };

export function ChargeMobileList({
  rows,
  canEdit,
  isFiltering,
  flashRowId,
  activeAccounts,
  pendingFocusCellRef,
  emptyLabel,
  hasPersistentCharge,
  isMonthOnlyCharge,
  onReorderInScope,
  onTogglePaid,
  onUpdate,
  onRemove,
}: {
  rows: ChargeRow[];
  canEdit: boolean;
  isFiltering: boolean;
  flashRowId: string | null;
  activeAccounts: ActiveAccount[];
  pendingFocusCellRef: MutableRefObject<{ chargeId: string; col: string } | null>;
  emptyLabel: string;
  hasPersistentCharge: (chargeId: string) => boolean;
  isMonthOnlyCharge: (chargeId: string) => boolean;
  onReorderInScope: (scope: ChargeScope, sourceId: string, targetId: string, pos: MovePos) => void;
  onTogglePaid: (chargeId: string, paid: boolean) => void;
  onUpdate: (chargeId: string, patch: ChargeUpdatePatch) => void;
  onRemove: (chargeId: string) => void;
}) {
  const communRows = useMemo(() => rows.filter((r) => r.scope === 'commun'), [rows]);
  const persoRows = useMemo(() => rows.filter((r) => r.scope === 'perso'), [rows]);

  if (rows.length === 0) {
    return <div className="px-4 py-10 text-center text-slate-400">{emptyLabel}</div>;
  }

  return (
    <div className="space-y-5 px-4 py-4 max-[360px]:space-y-4 max-[360px]:px-3 max-[360px]:py-3">
      {communRows.length ? (
        <ChargeMobileSection
          scope="commun"
          rows={communRows}
          isFiltering={isFiltering}
          canEdit={canEdit}
          flashRowId={flashRowId}
          activeAccounts={activeAccounts}
          pendingFocusCellRef={pendingFocusCellRef}
          hasPersistentCharge={hasPersistentCharge}
          isMonthOnlyCharge={isMonthOnlyCharge}
          onReorderInScope={onReorderInScope}
          onTogglePaid={onTogglePaid}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ) : null}

      {persoRows.length ? (
        <ChargeMobileSection
          scope="perso"
          rows={persoRows}
          isFiltering={isFiltering}
          canEdit={canEdit}
          flashRowId={flashRowId}
          activeAccounts={activeAccounts}
          pendingFocusCellRef={pendingFocusCellRef}
          hasPersistentCharge={hasPersistentCharge}
          isMonthOnlyCharge={isMonthOnlyCharge}
          onReorderInScope={onReorderInScope}
          onTogglePaid={onTogglePaid}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ) : null}
    </div>
  );
}

function ChargeMobileSection({
  scope,
  rows,
  isFiltering,
  canEdit,
  flashRowId,
  activeAccounts,
  pendingFocusCellRef,
  hasPersistentCharge,
  isMonthOnlyCharge,
  onReorderInScope,
  onTogglePaid,
  onUpdate,
  onRemove,
}: {
  scope: ChargeScope;
  rows: ChargeRow[];
  isFiltering: boolean;
  canEdit: boolean;
  flashRowId: string | null;
  activeAccounts: ActiveAccount[];
  pendingFocusCellRef: MutableRefObject<{ chargeId: string; col: string } | null>;
  hasPersistentCharge: (chargeId: string) => boolean;
  isMonthOnlyCharge: (chargeId: string) => boolean;
  onReorderInScope: (scope: ChargeScope, sourceId: string, targetId: string, pos: MovePos) => void;
  onTogglePaid: (chargeId: string, paid: boolean) => void;
  onUpdate: (chargeId: string, patch: ChargeUpdatePatch) => void;
  onRemove: (chargeId: string) => void;
}) {
  const reorderIds = useMemo(() => rows.filter((r) => hasPersistentCharge(r.id)).map((r) => r.id), [hasPersistentCharge, rows]);
  const title = scope === 'commun' ? 'Commun' : 'Perso';
  const titleColor = scope === 'commun' ? 'text-sky-200' : 'text-emerald-200';

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className={cx('text-xs font-semibold uppercase tracking-wide', titleColor)}>{title}</div>
        <div className="text-xs text-slate-400">{rows.length}</div>
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const canReorder = hasPersistentCharge(r.id) && !isFiltering;
          const reorderIdx = canReorder ? reorderIds.indexOf(r.id) : -1;
          const isMonthOnly = isMonthOnlyCharge(r.id);
          const editable = canEdit && (canReorder || isMonthOnly);
          return (
            <ChargeMobileCard
              key={r.id}
              row={r}
              highlight={r.id === flashRowId}
              isMonthOnly={isMonthOnly}
              canEdit={editable}
              activeAccounts={activeAccounts}
              pendingFocusCellRef={pendingFocusCellRef}
              canMoveUp={canReorder && reorderIdx > 0}
              canMoveDown={canReorder && reorderIdx >= 0 && reorderIdx < reorderIds.length - 1}
              onReorder={(dir) => {
                if (!canReorder) return;
                const targetId = dir === 'up' ? reorderIds[reorderIdx - 1] : reorderIds[reorderIdx + 1];
                if (!targetId) return;
                onReorderInScope(scope, r.id, targetId, dir === 'up' ? 'before' : 'after');
              }}
              onTogglePaid={(paid) => onTogglePaid(r.id, paid)}
              onUpdate={(patch) => onUpdate(r.id, patch)}
              onRemove={() => onRemove(r.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ChargeMobileCard({
  row,
  highlight,
  isMonthOnly,
  canEdit,
  activeAccounts,
  pendingFocusCellRef,
  canMoveUp,
  canMoveDown,
  onReorder,
  onTogglePaid,
  onUpdate,
  onRemove,
}: {
  row: ChargeRow;
  highlight: boolean;
  isMonthOnly: boolean;
  canEdit: boolean;
  activeAccounts: ActiveAccount[];
  pendingFocusCellRef: MutableRefObject<{ chargeId: string; col: string } | null>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onReorder: (dir: 'up' | 'down') => void;
  onTogglePaid: (paid: boolean) => void;
  onUpdate: (patch: ChargeUpdatePatch) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (row.destination?.kind !== 'text') return;
    if ((row.destination.text ?? '') === '') setExpanded(true);
  }, [row.destination]);

  const tint =
    row.scope === 'commun'
      ? 'border-sky-200/25 border-l-4 border-l-sky-300/70 bg-gradient-to-br from-sky-400/20 via-ink-950/40 to-ink-950/35'
      : 'border-emerald-200/25 border-l-4 border-l-emerald-300/70 bg-gradient-to-br from-emerald-400/20 via-ink-950/40 to-ink-950/35';
  const paidFx = row.paid ? 'opacity-70' : 'opacity-100';

  const typeChip =
    row.scope === 'commun' ? 'border-sky-200/25 bg-sky-400/12 text-sky-100' : 'border-emerald-200/25 bg-emerald-400/12 text-emerald-100';
  const paymentChip =
    row.payment === 'auto'
      ? 'border-violet-200/25 bg-violet-400/12 text-violet-100'
      : 'border-amber-200/25 bg-amber-400/12 text-amber-100';
  const monthOnlyChip = 'border-slate-200/25 bg-slate-400/12 text-slate-100';

  const chipBase = 'fm-chip-pill h-6 px-2 text-[10px] font-semibold';
  const metaSelect = 'fm-input-select h-9 rounded-xl px-3 text-[12px] font-semibold';
  const ioSelect = 'fm-input-select h-10 w-full rounded-xl px-3 text-[13px] font-medium';

  const hasAccountId = typeof row.accountId === 'string' && row.accountId.length > 0;
  const accountInActiveList = hasAccountId ? activeAccounts.some((a) => a.id === row.accountId) : false;
  const accountValue = accountInActiveList ? row.accountId : hasAccountId ? '__UNAVAILABLE__' : '';
  const destinationAccountId = row.destination?.kind === 'account' ? row.destination.accountId : '';
  const destinationInActiveList = destinationAccountId ? activeAccounts.some((a) => a.id === destinationAccountId) : false;
  const destinationValue = destinationInActiveList ? destinationAccountId : destinationAccountId ? '__UNAVAILABLE__' : '';

  return (
    <div
      className={cx(
        'rounded-2xl border p-2.5 shadow-[0_12px_40px_-32px_rgba(0,0,0,0.85)] backdrop-blur',
        tint,
        paidFx,
        highlight && 'ring-2 ring-slate-200/30 ring-inset',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="pt-1">
          <input
            type="checkbox"
            checked={row.paid}
            disabled={!canEdit}
            onChange={(e) => onTogglePaid(e.target.checked)}
            aria-label={`Virement fait: ${row.name}`}
            className={cx(
              'h-4 w-4 rounded border-white/20 bg-white/5',
              row.scope === 'commun' ? 'text-sky-400' : 'text-emerald-400',
            )}
            data-grid="charges"
            data-charge-id={row.id}
            data-col="0"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <InlineTextInput
              ariaLabel="Libellé"
              value={row.name}
              disabled={!canEdit}
              className={cx(
                'fm-input h-9 min-w-0 flex-1 rounded-xl px-3 text-[14px] font-semibold ring-0',
                row.paid && 'line-through decoration-white/25',
              )}
              onCommit={(name) => onUpdate({ name })}
              inputProps={{ 'data-grid': 'charges', 'data-charge-id': row.id, 'data-col': '1' }}
            />

            <button
              type="button"
              className={cx('fm-btn-ghost flex-none px-2.5 py-1 text-right', !canEdit && 'opacity-50 hover:bg-white/5')}
              disabled={!canEdit}
              onClick={() => setExpanded(true)}
              aria-label="Modifier le montant et les détails"
            >
              <div className="text-sm font-semibold tabular-nums text-slate-100">
                {formatEUR(row.scope === 'commun' ? row.myShareCents : row.amountCents)}
              </div>
              {row.scope === 'commun' ? <div className="text-[10px] tabular-nums text-slate-400">sur {formatEUR(row.amountCents)}</div> : null}
            </button>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span title={row.dueDate} className={cx(chipBase, 'text-slate-300')}>
              J{pad2(row.dayOfMonth)}
            </span>
            <span className={cx(chipBase, typeChip)}>{row.scope === 'commun' ? 'Commun' : 'Perso'}</span>
            <span className={cx(chipBase, paymentChip)}>{row.payment === 'auto' ? 'Auto' : 'Manuel'}</span>
            {row.destinationLabel ? (
              <span title={row.destinationLabel} className={cx(chipBase, 'max-w-[220px] wrap-break-word text-slate-300')}>
                → {row.destinationLabel}
              </span>
            ) : null}
            {isMonthOnly ? (
              <span title="Charge uniquement pour ce mois" className={cx(chipBase, monthOnlyChip)}>
                Ponctuelle
              </span>
            ) : null}

            <button
              type="button"
              className={cx(
                'fm-btn-ghost ml-auto inline-flex h-6 items-center rounded-full px-2.5 text-[10px] font-semibold text-slate-200',
                expanded && 'bg-white/8',
                !canEdit && 'opacity-50 hover:bg-white/5',
              )}
              onClick={() => setExpanded((v) => !v)}
              disabled={!canEdit}
              aria-expanded={expanded}
              aria-label={expanded ? 'Réduire les détails' : 'Afficher les détails'}
            >
              {expanded ? 'Réduire' : 'Détails'}
            </button>
          </div>

          {expanded ? (
            <div className="fm-card-soft mt-3 grid gap-2 p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Jour</div>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[11px] font-semibold text-slate-400">J</div>
                    <InlineTextInput
                      ariaLabel="Jour du prélèvement (1 à 31)"
                      value={pad2(row.dayOfMonth)}
                      disabled={!canEdit}
                      className="fm-input h-9 w-full rounded-xl pl-7 pr-3 text-[13px] font-semibold tabular-nums ring-0"
                      onCommit={(raw) => {
                        const digits = raw.replace(/[^\d]/g, '');
                        if (!digits) return;
                        const n = Number.parseInt(digits, 10);
                        if (!Number.isFinite(n)) return;
                        const clamped = Math.max(1, Math.min(31, n));
                        if (clamped === row.dayOfMonth) return;
                        onUpdate({ dayOfMonth: clamped });
                      }}
                      inputProps={{
                        title: row.dueDate,
                        inputMode: 'numeric',
                        pattern: '[0-9]*',
                        maxLength: 2,
                        'data-grid': 'charges',
                        'data-charge-id': row.id,
                        'data-col': '2',
                      }}
                    />
                  </div>
                </label>

                <label className="grid gap-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Montant</div>
                  <InlineNumberInput
                    ariaLabel="Montant (euros)"
                    value={centsToEuros(row.amountCents)}
                    step={0.01}
                    min={0}
                    suffix="€"
                    disabled={!canEdit}
                    className="w-full"
                    inputClassName="h-9 rounded-xl px-3 text-[13px]"
                    onCommit={(euros) => onUpdate({ amountCents: eurosToCents(euros) })}
                    inputProps={{ 'data-grid': 'charges', 'data-charge-id': row.id, 'data-col': '7' }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Type</div>
                  <select
                    className={cx(metaSelect, typeChip)}
                    value={row.scope}
                    onChange={(e) => onUpdate({ scope: e.target.value as ChargeScope })}
                    aria-label="Type"
                    data-grid="charges"
                    data-charge-id={row.id}
                    data-col="3"
                    disabled={!canEdit}
                  >
                    <option value="commun">Commun</option>
                    <option value="perso">Perso</option>
                  </select>
                </label>

                <label className="grid gap-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Paiement</div>
                  <select
                    className={cx(metaSelect, paymentChip)}
                    value={row.payment}
                    onChange={(e) => onUpdate({ payment: e.target.value as Charge['payment'] })}
                    aria-label="Paiement"
                    data-grid="charges"
                    data-charge-id={row.id}
                    data-col="4"
                    disabled={!canEdit}
                  >
                    <option value="auto">Auto</option>
                    <option value="manuel">Manuel</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Compte</div>
                <select
                  className={ioSelect}
                  value={accountValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v || v === '__UNAVAILABLE__') return;
                    onUpdate({ accountId: v as Charge['accountId'] });
                  }}
                  aria-label="Provenance (compte)"
                  data-grid="charges"
                  data-charge-id={row.id}
                  data-col="5"
                  disabled={!canEdit}
                >
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {accountValue === '__UNAVAILABLE__' ? (
                    <option value="__UNAVAILABLE__" disabled>
                      Inconnu: {String(row.accountId)}
                    </option>
                  ) : null}
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Destination</div>
                {row.destination?.kind === 'text' ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <InlineTextInput
                      ariaLabel="Destination (texte)"
                      value={row.destination.text}
                      placeholder="Destination…"
                      disabled={!canEdit}
                      className="fm-input h-10 min-w-0 flex-1 rounded-xl px-3 text-[13px] font-medium ring-0"
                      onCommit={(text) => {
                        const next = text.trim();
                        onUpdate({ destination: next ? { kind: 'text', text: next } : null });
                      }}
                      inputProps={{ 'data-grid': 'charges', 'data-charge-id': row.id, 'data-col': '6' }}
                    />
                    <button
                      className="fm-btn-ghost h-10 flex-none rounded-xl px-3 text-sm text-slate-200 disabled:opacity-40"
                      onClick={() => onUpdate({ destination: null })}
                      aria-label="Supprimer la destination"
                      type="button"
                      disabled={!canEdit}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <select
                    className={ioSelect}
                    value={row.destination?.kind === 'account' ? destinationValue : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        onUpdate({ destination: null });
                        return;
                      }
                      if (v === '__UNAVAILABLE__') return;
                      if (v === '__TEXT__') {
                        pendingFocusCellRef.current = { chargeId: row.id, col: '6' };
                        setExpanded(true);
                        onUpdate({ destination: { kind: 'text', text: '' } });
                        return;
                      }
                      onUpdate({ destination: { kind: 'account', accountId: v as Charge['accountId'] } });
                    }}
                    aria-label="Destination"
                    data-grid="charges"
                    data-charge-id={row.id}
                    data-col="6"
                    disabled={!canEdit}
                  >
                    <option value="">Aucune</option>
                    {destinationValue === '__UNAVAILABLE__' ? (
                      <option value="__UNAVAILABLE__" disabled>
                        Inconnu: {destinationAccountId}
                      </option>
                    ) : null}
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id}
                      </option>
                    ))}
                    <option value="__TEXT__">Autre…</option>
                  </select>
                )}
              </label>

              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="text-xs text-slate-400">{row.scope === 'commun' ? `Ma part: ${formatEUR(row.myShareCents)}` : null}</div>
                <button
                  className={cx(
                    'h-9 rounded-xl border border-rose-200/25 bg-rose-400/10 px-3 text-[12px] font-semibold text-rose-100 transition-colors hover:bg-rose-400/15',
                    !canEdit && 'opacity-40 hover:bg-rose-400/10',
                  )}
                  disabled={!canEdit}
                  onClick={onRemove}
                  aria-label={`Supprimer ${row.name}`}
                  type="button"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="fm-inline-panel flex overflow-hidden rounded-full">
            <button
              type="button"
              className="h-8 w-8 text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
              onClick={() => onReorder('up')}
              aria-label="Monter"
              disabled={!canEdit || !canMoveUp}
            >
              ↑
            </button>
            <button
              type="button"
              className="h-8 w-8 border-l border-white/10 text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
              onClick={() => onReorder('down')}
              aria-label="Descendre"
              disabled={!canEdit || !canMoveDown}
            >
              ↓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
