import { useEffect, useRef, useState, type KeyboardEventHandler } from 'react';
import { centsToEuros, eurosToCents, formatEUR } from '../lib/money';
import { chargesForMonth } from '../state/selectors';
import { useStore } from '../state/store';
import { pad2, type YM } from '../lib/date';
import type { Charge, ChargeScope } from '../state/types';
import { cx } from './cx';
import { InlineNumberInput, InlineTextInput } from './components/InlineInput';

export function ChargesTable({ ym, archived }: { ym: YM; archived: boolean }) {
  const { state, dispatch } = useStore();
  const rows = chargesForMonth(state, ym);
  const activeAccounts = state.accounts.filter((a) => a.active);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const prevRowIdsRef = useRef<string[]>([]);
  const pendingFocusColRef = useRef<string | null>(null);
  const pendingFocusCellRef = useRef<{ chargeId: string; col: string } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; scope: ChargeScope } | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);

  const canEdit = !archived;

  useEffect(() => {
    const prev = prevRowIdsRef.current;
    const next = rows.map((r) => r.id);
    prevRowIdsRef.current = next;

    const focusCell = (chargeId: string, col: string) => {
      window.requestAnimationFrame(() => {
        tableRef.current
          ?.querySelector<HTMLElement>(`[data-grid="charges"][data-charge-id="${chargeId}"][data-col="${col}"]`)
          ?.focus();
      });
    };

    const pendingCol = pendingFocusColRef.current;
    if (pendingCol) {
      const newId = next.find((id) => !prev.includes(id));
      if (newId) {
        pendingFocusColRef.current = null;
        focusCell(newId, pendingCol);
      }
    }

    const pendingCell = pendingFocusCellRef.current;
    if (pendingCell) {
      pendingFocusCellRef.current = null;
      focusCell(pendingCell.chargeId, pendingCell.col);
    }
  }, [rows]);

  const onGridKeyDown: KeyboardEventHandler<HTMLTableElement> = (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (target.dataset.grid !== 'charges') return;
    const chargeId = target.dataset.chargeId;
    const col = Number(target.dataset.col);
    if (!chargeId || !Number.isFinite(col)) return;

    window.requestAnimationFrame(() => {
      const root = tableRef.current;
      if (!root) return;
      const currentRow = root.querySelector<HTMLTableRowElement>(`tr[data-row-id="${chargeId}"]`);
      if (!currentRow) return;
      const sibling = e.shiftKey ? currentRow.previousElementSibling : currentRow.nextElementSibling;
      if (!sibling || !(sibling instanceof HTMLTableRowElement)) return;

      const sameCol = sibling.querySelector<HTMLElement>(`[data-grid="charges"][data-col="${col}"]`);
      const isEnabled = (el: HTMLElement | null) => {
        if (!el) return false;
        if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement) {
          if ('disabled' in el && (el as { disabled?: boolean }).disabled) return false;
        }
        return true;
      };

      const pick =
        isEnabled(sameCol)
          ? sameCol
          : Array.from(sibling.querySelectorAll<HTMLElement>('[data-grid="charges"]'))
              .sort((a, b) => Number(a.dataset.col) - Number(b.dataset.col))
              .find((el) => isEnabled(el)) ?? null;

      pick?.focus();
    });
  };

  const reorderInScope = (
    scope: ChargeScope,
    sourceId: string,
    targetId: string,
    pos: 'before' | 'after',
  ) => {
    const groupIds = rows.filter((r) => r.scope === scope).map((r) => r.id);
    const srcIdx = groupIds.indexOf(sourceId);
    const tgtIdx = groupIds.indexOf(targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const next = [...groupIds];
    next.splice(srcIdx, 1);
    const insertIdxRaw = tgtIdx + (pos === 'after' ? 1 : 0);
    const insertIdx = srcIdx < insertIdxRaw ? insertIdxRaw - 1 : insertIdxRaw;
    next.splice(Math.max(0, Math.min(next.length, insertIdx)), 0, sourceId);

    dispatch({ type: 'REORDER_CHARGES', scope, orderedIds: next });
  };

	  return (
	    <section className="motion-hover motion-pop overflow-hidden rounded-3xl border border-white/15 bg-ink-950/60 shadow-[0_12px_40px_-30px_rgba(0,0,0,0.85)]">
      <div className="flex items-center justify-between gap-4 border-b border-white/15 px-6 py-5">
        <div>
          <h2 className="text-sm text-slate-300">Charges</h2>
          <div className="mt-1 text-xl font-semibold tracking-tight">{rows.length} lignes</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={cx(
              'rounded-2xl border border-white/15 bg-white/7 px-4 py-2 text-sm transition-colors duration-150 hover:bg-white/10',
              !canEdit && 'opacity-50',
            )}
            disabled={!canEdit}
            onClick={() => {
              const defaultAccount = activeAccounts[0]?.id ?? state.accounts[0]?.id ?? 'BS_PERSO';
              pendingFocusColRef.current = '1';
              dispatch({
                type: 'ADD_CHARGE',
                charge: {
                  name: 'Nouvelle charge',
                  amountCents: 0,
                  dayOfMonth: 1,
                  accountId: defaultAccount,
                  scope: 'perso',
                  splitPercent: 50,
                  payment: 'manuel',
                  active: true,
                },
              });
            }}
          >
            + Ajouter
          </button>
        </div>
      </div>

      <div className="overflow-auto">
        <table ref={tableRef} onKeyDown={onGridKeyDown} className="min-w-full table-fixed border-separate border-spacing-0">
          <caption className="sr-only">Liste des charges du mois</caption>
	          <thead className="sticky top-0 z-10 bg-ink-950/95">
            <tr className="text-left text-xs text-slate-400">
              <Th className="w-[88px]">OK</Th>
              <Th>Libellé</Th>
              <Th className="w-[120px] text-right">Montant</Th>
              <Th className="w-[120px] text-right">Ma part</Th>
              <Th className="w-[56px]" ariaHidden />
            </tr>
          </thead>
          <tbody className="text-[13px] leading-tight">
            {rows.map((r) => {
              const model = state.charges.find((c) => c.id === r.id) ?? null;
              const editable = canEdit && Boolean(model);
              const isInactive = Boolean(model && !model.active);
              const tint =
                r.scope === 'commun'
                  ? 'bg-sky-500/20 hover:bg-sky-500/30'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30';
              const paidFx = r.paid ? 'opacity-70' : 'opacity-100';
              const typeChip =
                r.scope === 'commun'
                  ? 'border-sky-200/30 bg-sky-400/15 text-sky-50'
                  : 'border-emerald-200/30 bg-emerald-400/15 text-emerald-50';
	              const paymentChip =
	                r.payment === 'auto'
	                  ? 'border-violet-200/30 bg-violet-400/15 text-violet-50'
	                  : 'border-amber-200/30 bg-amber-400/15 text-amber-50';
	              const metaSelect =
	                'h-6 rounded-lg border border-white/15 bg-ink-950/35 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-100 shadow-inner shadow-black/20 outline-none transition-colors duration-150 focus:border-white/25 focus:bg-ink-950/45';
	              const ioSelectBase =
	                'min-w-0 max-w-full h-7 rounded-lg border border-white/15 px-2 text-[11px] font-medium text-slate-100 shadow-inner shadow-black/20 outline-none transition-colors duration-150 focus:border-white/25 focus:bg-ink-950/45';
	              const hasAccountId = typeof r.accountId === 'string' && r.accountId.length > 0;
	              const account = hasAccountId ? state.accounts.find((a) => a.id === r.accountId) ?? null : null;
	              const accountInActiveList = hasAccountId ? activeAccounts.some((a) => a.id === r.accountId) : false;
	              const accountValue = accountInActiveList ? r.accountId : hasAccountId ? '__UNAVAILABLE__' : '';
	              const accountUnavailableLabel = account ? `Supprimé: ${account.id}` : `Inconnu: ${String(r.accountId)}`;

	              const destinationAccountId = r.destination?.kind === 'account' ? r.destination.accountId : '';
	              const destinationAccount = destinationAccountId ? state.accounts.find((a) => a.id === destinationAccountId) ?? null : null;
	              const destinationInActiveList = destinationAccountId ? activeAccounts.some((a) => a.id === destinationAccountId) : false;
	              const destinationValue = destinationInActiveList ? destinationAccountId : destinationAccountId ? '__UNAVAILABLE__' : '';
	              const destinationUnavailableLabel = destinationAccount
	                ? `Supprimé: ${destinationAccount.id}`
	                : destinationAccountId
	                  ? `Inconnu: ${destinationAccountId}`
	                  : '';

	              return (
	                <tr
                  key={r.id}
                  data-row-id={r.id}
                  className={cx(
                    'border-t border-white/5 transition-colors transition-opacity duration-150',
                    tint,
                    paidFx,
                    dragging?.id === r.id && 'opacity-60',
                    dragOver?.id === r.id && dragging?.scope === r.scope
                      ? dragOver.pos === 'before'
                        ? 'shadow-[inset_0_2px_0_rgba(189,147,249,0.85)]'
                        : 'shadow-[inset_0_-2px_0_rgba(189,147,249,0.85)]'
                      : null,
                  )}
                  onDragOver={(e) => {
                    if (!canEdit) return;
                    const src = dragging;
                    if (!src) return;
                    if (src.scope !== r.scope) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const rect = (e.currentTarget as HTMLTableRowElement).getBoundingClientRect();
                    const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                    setDragOver({ id: r.id, pos });
                  }}
                  onDrop={(e) => {
                    if (!canEdit) return;
                    const srcId = e.dataTransfer.getData('text/plain') || dragging?.id || '';
                    if (!srcId || srcId === r.id) return;
                    if (dragging?.scope !== r.scope) return;
                    e.preventDefault();
                    reorderInScope(r.scope, srcId, r.id, dragOver?.id === r.id ? dragOver.pos : 'before');
                    setDragging(null);
                    setDragOver(null);
                  }}
                >
                  <Td className="w-[88px]">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        draggable={editable}
                        disabled={!editable}
                        className={cx(
                          'rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] leading-none text-slate-200 transition-colors hover:bg-white/10',
                          !editable && 'opacity-40',
                        )}
                        aria-label={`Réordonner: ${r.name}`}
                        title="Glisser-déposer pour réordonner (Alt+↑/↓)"
                        onDragStart={(e) => {
                          if (!editable) {
                            e.preventDefault();
                            return;
                          }
                          setDragging({ id: r.id, scope: r.scope });
                          setDragOver(null);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', r.id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setDragOver(null);
                        }}
                        onKeyDown={(e) => {
                          if (!editable) return;
                          if (!e.altKey) return;
                          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                          e.preventDefault();
                          const groupIds = rows.filter((x) => x.scope === r.scope).map((x) => x.id);
                          const idx = groupIds.indexOf(r.id);
                          const nextIdx = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
                          const targetId = groupIds[nextIdx];
                          if (!targetId) return;
                          reorderInScope(r.scope, r.id, targetId, e.key === 'ArrowUp' ? 'before' : 'after');
                        }}
                      >
                        ⋮⋮
                      </button>
                      <input
                        type="checkbox"
                        checked={r.paid}
                        disabled={!canEdit}
                        onChange={(e) => dispatch({ type: 'TOGGLE_CHARGE_PAID', ym, chargeId: r.id, paid: e.target.checked })}
                        aria-label={`Prélevé: ${r.name}`}
                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-400"
                        data-grid="charges"
                        data-charge-id={r.id}
                        data-col="0"
                      />
                    </div>
                  </Td>
                  <Td>
                    <div className="min-w-[240px]">
	                      <InlineTextInput
	                        ariaLabel="Libellé"
	                        value={r.name}
	                        disabled={!editable}
	                        className={cx(
	                          'h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-[13px] font-medium text-slate-100 outline-none ring-0 focus:border-white/15 focus:bg-white/10',
	                          r.paid && 'line-through decoration-white/25',
	                        )}
	                        onCommit={(name) => dispatch({ type: 'UPDATE_CHARGE', chargeId: r.id, patch: { name } })}
	                        inputProps={{ 'data-grid': 'charges', 'data-charge-id': r.id, 'data-col': '1' }}
	                      />
		                      <div className="mt-2 grid gap-2 text-[11px] text-slate-200/90">
		                        <div
		                          className={cx(
		                            'flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1',
		                            !editable && 'opacity-70',
		                          )}
		                        >
		                          {editable ? (
		                            <div className="relative">
		                              <div className="pointer-events-none absolute inset-y-0 left-1 flex items-center text-[8px] font-semibold text-slate-400">
		                                J
		                              </div>
		                              <InlineTextInput
		                                ariaLabel="Jour du prélèvement (1 à 31)"
		                                value={pad2(r.dayOfMonth)}
		                                disabled={!editable}
		                                className="h-5 w-[34px] rounded-lg border border-white/15 bg-ink-950/35 pl-3 pr-0.5 text-[8px] font-semibold tabular-nums text-slate-100 outline-none ring-0 focus:border-white/25 focus:bg-ink-950/45"
		                                onCommit={(raw) => {
		                                  const digits = raw.replace(/[^\d]/g, '');
		                                  if (!digits) return;
		                                  const n = Number.parseInt(digits, 10);
	                                  if (!Number.isFinite(n)) return;
	                                  const clamped = Math.max(1, Math.min(31, n));
	                                  if (clamped === r.dayOfMonth) return;
	                                  dispatch({ type: 'UPDATE_CHARGE', chargeId: r.id, patch: { dayOfMonth: clamped } });
	                                }}
	                                inputProps={{
	                                  title: r.dueDate,
	                                  inputMode: 'numeric',
	                                  pattern: '[0-9]*',
	                                  maxLength: 2,
	                                  'data-grid': 'charges',
	                                  'data-charge-id': r.id,
	                                  'data-col': '2',
	                                }}
	                              />
		                            </div>
		                          ) : (
		                            <span
		                              title={r.dueDate}
		                              className="inline-flex h-5 items-center rounded-lg border border-white/15 bg-ink-950/35 px-1 text-[8px] font-semibold tabular-nums text-slate-100"
		                            >
		                              J{pad2(r.dayOfMonth)}
		                            </span>
		                          )}

	                          {editable ? (
	                            <select
	                              className={cx(metaSelect, typeChip)}
	                              value={r.scope}
	                              onChange={(e) =>
	                                dispatch({
	                                  type: 'UPDATE_CHARGE',
	                                  chargeId: r.id,
	                                  patch: { scope: e.target.value as ChargeScope },
	                                })
	                              }
	                              aria-label="Type"
	                              data-grid="charges"
	                              data-charge-id={r.id}
	                              data-col="3"
	                            >
	                              <option value="commun">Commun</option>
	                              <option value="perso">Perso</option>
	                            </select>
		                          ) : (
		                            <span className={cx('inline-flex h-6 items-center rounded-lg border px-2 text-[10px] font-semibold uppercase tracking-wide', typeChip)}>
		                              {r.scope === 'commun' ? 'Commun' : 'Perso'}
		                            </span>
		                          )}

	                          {editable ? (
	                            <select
	                              className={cx(metaSelect, paymentChip)}
	                              value={r.payment}
	                              onChange={(e) =>
	                                dispatch({
	                                  type: 'UPDATE_CHARGE',
	                                  chargeId: r.id,
	                                  patch: { payment: e.target.value as Charge['payment'] },
	                                })
	                              }
	                              aria-label="Paiement"
	                              data-grid="charges"
	                              data-charge-id={r.id}
	                              data-col="4"
	                            >
	                              <option value="auto">Auto</option>
	                              <option value="manuel">Manuel</option>
	                            </select>
		                          ) : (
		                            <span className={cx('inline-flex h-6 items-center rounded-lg border px-2 text-[10px] font-semibold uppercase tracking-wide', paymentChip)}>
		                              {r.payment === 'auto' ? 'Auto' : 'Manuel'}
		                            </span>
		                          )}

		                          {isInactive ? (
		                            <span className="inline-flex h-6 items-center rounded-full bg-white/10 px-2 text-[10px] text-slate-200">
		                              inactif
		                            </span>
		                          ) : null}
		                        </div>

		                        <div
		                          className={cx(
		                            'grid w-full max-w-[360px] min-w-0 justify-self-start grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-2 py-1',
		                            !editable && 'opacity-70',
		                          )}
		                        >
	                          {editable ? (
	                            <select
	                              className={cx(ioSelectBase, 'w-full truncate bg-ink-950/35')}
	                              value={accountValue}
	                              title={r.accountName}
	                              onChange={(e) => {
	                                const v = e.target.value;
	                                if (!v || v === '__UNAVAILABLE__') return;
	                                dispatch({ type: 'UPDATE_CHARGE', chargeId: r.id, patch: { accountId: v as Charge['accountId'] } });
	                              }}
	                              aria-label="Provenance (compte)"
	                              data-grid="charges"
	                              data-charge-id={r.id}
	                              data-col="5"
	                            >
	                              <option value="" disabled>
	                                Compte…
	                              </option>
	                              {accountValue === '__UNAVAILABLE__' ? (
	                                <option value="__UNAVAILABLE__" disabled>
	                                  {accountUnavailableLabel}
	                                </option>
	                              ) : null}
	                              {activeAccounts.map((a) => (
	                                <option key={a.id} value={a.id}>
	                                  {a.id}
	                                </option>
	                              ))}
	                            </select>
	                          ) : (
	                            <span
	                              className="min-w-0 truncate rounded-lg border border-white/15 bg-ink-950/35 px-2 py-1 text-[11px] font-medium text-slate-100"
	                              title={r.accountName}
	                            >
	                              {r.accountName}
	                            </span>
	                          )}

	                          <span className="select-none text-slate-500">→</span>

	                          {editable ? (
	                            r.destination?.kind === 'text' ? (
	                              <div className="flex min-w-0 items-center gap-1">
		                                <InlineTextInput
		                                  ariaLabel="Destination (texte)"
		                                  value={r.destination.text}
		                                  placeholder="Destination…"
		                                  disabled={!editable}
		                                  className="h-7 w-full min-w-0 rounded-lg border border-white/15 bg-ink-950/35 px-2 text-[11px] font-medium text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-white/25 focus:bg-ink-950/45"
		                                  onCommit={(text) => {
		                                    const next = text.trim();
		                                    dispatch({
		                                      type: 'UPDATE_CHARGE',
	                                      chargeId: r.id,
	                                      patch: { destination: next ? { kind: 'text', text: next } : null },
	                                    });
	                                  }}
	                                  inputProps={{ 'data-grid': 'charges', 'data-charge-id': r.id, 'data-col': '6' }}
	                                />
	                                <button
	                                  className="h-7 flex-none rounded-lg border border-white/10 bg-white/5 px-2 text-[11px] text-slate-200 transition-colors hover:bg-white/10"
	                                  onClick={() => dispatch({ type: 'UPDATE_CHARGE', chargeId: r.id, patch: { destination: null } })}
	                                  aria-label="Supprimer la destination"
	                                  type="button"
	                                >
	                                  ✕
	                                </button>
	                              </div>
	                            ) : (
	                              <select
	                                className={cx(
	                                  ioSelectBase,
	                                  'w-full truncate',
	                                  r.destination?.kind === 'account'
	                                    ? 'bg-ink-950/35'
	                                    : 'bg-ink-950/20',
	                                )}
	                                value={r.destination?.kind === 'account' ? destinationValue : ''}
	                                title={r.destinationLabel ?? undefined}
	                                onChange={(e) => {
	                                  const v = e.target.value;
	                                  if (!v) {
	                                    dispatch({ type: 'UPDATE_CHARGE', chargeId: r.id, patch: { destination: null } });
	                                    return;
	                                  }
		                                  if (v === '__UNAVAILABLE__') return;
		                                  if (v === '__TEXT__') {
		                                    pendingFocusCellRef.current = { chargeId: r.id, col: '6' };
		                                    dispatch({
		                                      type: 'UPDATE_CHARGE',
		                                      chargeId: r.id,
		                                      patch: { destination: { kind: 'text', text: '' } },
	                                    });
	                                    return;
	                                  }
	                                  dispatch({
	                                    type: 'UPDATE_CHARGE',
	                                    chargeId: r.id,
	                                    patch: { destination: { kind: 'account', accountId: v as Charge['accountId'] } },
	                                  });
	                                }}
	                                aria-label="Destination"
	                                data-grid="charges"
	                                data-charge-id={r.id}
	                                data-col="6"
	                              >
	                                <option value="">Destination…</option>
	                                {destinationValue === '__UNAVAILABLE__' ? (
	                                  <option value="__UNAVAILABLE__" disabled>
	                                    {destinationUnavailableLabel}
	                                  </option>
	                                ) : null}
	                                {activeAccounts.map((a) => (
	                                  <option key={a.id} value={a.id}>
	                                    {a.id}
	                                  </option>
	                                ))}
	                                <option value="__TEXT__">Autre…</option>
	                              </select>
	                            )
	                          ) : r.destinationLabel ? (
	                            <span
	                              className="min-w-0 truncate rounded-lg border border-white/15 bg-ink-950/35 px-2 py-1 text-[11px] font-medium text-slate-100"
	                              title={r.destinationLabel}
	                            >
	                              {r.destinationLabel}
	                            </span>
	                          ) : (
	                            <span className="text-[11px] text-slate-500">—</span>
	                          )}
	                        </div>
	                      </div>
	                    </div>
	                  </Td>
                  <Td className="text-right">
                    <InlineNumberInput
                      ariaLabel="Montant (euros)"
                      value={centsToEuros(r.amountCents)}
                      step={0.01}
                      min={0}
                      suffix="€"
                      disabled={!editable}
                      className="ml-auto w-[120px]"
                      inputClassName="h-8 rounded-lg px-2 text-[13px]"
                      onCommit={(euros) =>
                        dispatch({ type: 'UPDATE_CHARGE', chargeId: r.id, patch: { amountCents: eurosToCents(euros) } })
                      }
                      inputProps={{ 'data-grid': 'charges', 'data-charge-id': r.id, 'data-col': '7' }}
                    />
                  </Td>
                  <Td className="text-right">
                    <div className="text-[13px] font-semibold tabular-nums text-slate-100">{formatEUR(r.myShareCents)}</div>
                  </Td>
                  <Td className="text-right">
                    <button
                      className={cx(
                        'rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs transition-colors duration-150 hover:bg-white/10',
                        !editable && 'opacity-40',
                      )}
                      disabled={!editable}
                      onClick={() => dispatch({ type: 'REMOVE_CHARGE', chargeId: r.id })}
                      aria-label={`Supprimer ${r.name}`}
                    >
                      ✕
                    </button>
                  </Td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={5} className="py-10 text-center text-slate-400">
                  Aucune charge. Ajoute une ligne pour commencer.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="border-t border-white/15 px-6 py-4 text-xs text-slate-400">
        Astuce: Entrée pour valider + descendre (Shift+Entrée remonte), Échap pour annuler, glisser ⋮⋮ pour réordonner.
      </div>
    </section>
  );
}

function Th({
  className,
  children,
  scope = 'col',
  ariaHidden,
}: {
  className?: string;
  children?: React.ReactNode;
  scope?: 'col' | 'row' | 'colgroup' | 'rowgroup';
  ariaHidden?: boolean;
}) {
  return (
    <th
      scope={scope}
      aria-hidden={ariaHidden}
      className={cx('border-b border-white/15 px-3 py-2 font-medium', className)}
    >
      {children}
    </th>
  );
}

function Td({
  className,
  children,
  colSpan,
}: {
  className?: string;
  children: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <td className={cx('px-3 py-2 align-top', className)} colSpan={colSpan}>
      {children}
    </td>
  );
}
