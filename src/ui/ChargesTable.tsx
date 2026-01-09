import { useEffect, useRef, useState, type KeyboardEventHandler, type MutableRefObject } from 'react';
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
  const mobileRef = useRef<HTMLDivElement | null>(null);
  const [isSmUp, setIsSmUp] = useState<boolean>(() => {
    try {
      return window.matchMedia('(min-width: 640px)').matches;
    } catch {
      return true;
    }
  });
  const prevRowIdsRef = useRef<string[]>([]);
  const pendingFocusColRef = useRef<string | null>(null);
  const pendingFocusCellRef = useRef<{ chargeId: string; col: string } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; scope: ChargeScope } | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);

  const canEdit = !archived;

  useEffect(() => {
    try {
      const mq = window.matchMedia('(min-width: 640px)');
      setIsSmUp(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setIsSmUp(e.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    const prev = prevRowIdsRef.current;
    const next = rows.map((r) => r.id);
    prevRowIdsRef.current = next;

    const focusCell = (chargeId: string, col: string) => {
      window.requestAnimationFrame(() => {
        const root = isSmUp ? tableRef.current : mobileRef.current;
        root
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
  }, [isSmUp, rows]);

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

  const communRows = rows.filter((r) => r.scope === 'commun');
  const persoRows = rows.filter((r) => r.scope === 'perso');

	  return (
	    <section
	      data-tour="charges"
	      className="motion-hover motion-pop overflow-hidden rounded-3xl border border-white/15 bg-ink-950/60 shadow-[0_12px_40px_-30px_rgba(0,0,0,0.85)]"
	    >
      <div className="flex items-center justify-between gap-4 border-b border-white/15 px-4 py-4 sm:px-6 sm:py-5">
        <div>
          <h2 className="text-sm text-slate-300">Charges</h2>
          <div className="mt-1 text-xl font-semibold tracking-tight">{rows.length} lignes</div>
        </div>

        <div className="flex items-center gap-2">
	          <button
	            data-tour="add-charge"
	            className={cx(
	              'rounded-2xl border border-white/15 bg-white/7 px-4 py-2 text-sm transition-colors duration-150 hover:bg-white/10',
	              !canEdit && 'opacity-50',
	            )}
            disabled={!canEdit}
            onClick={() => {
              const defaultAccount = activeAccounts[0]?.id ?? state.accounts[0]?.id ?? 'PERSONAL_MAIN';
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

      {isSmUp ? (
        <div className="overflow-auto">
          <table ref={tableRef} onKeyDown={onGridKeyDown} className="min-w-full table-fixed border-separate border-spacing-0">
            <caption className="sr-only">Liste des charges du mois</caption>
	            <thead className="sticky top-0 z-10 bg-ink-950/95">
              <tr className="text-left text-xs text-slate-400">
                <Th className="w-[76px] sm:w-[88px]">OK</Th>
                <Th>Libellé</Th>
                <Th className="hidden w-[120px] text-right sm:table-cell">Montant</Th>
                <Th className="hidden w-[120px] text-right sm:table-cell">Ma part</Th>
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
                  <Td className="w-[76px] sm:w-[88px]">
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
                    <div className="min-w-0 sm:min-w-[240px]">
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

	                        <div className="sm:hidden">
	                          <div
	                            className={cx(
	                              'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1',
	                              !editable && 'opacity-70',
	                            )}
	                          >
	                            <InlineNumberInput
	                              ariaLabel="Montant (euros)"
	                              value={centsToEuros(r.amountCents)}
	                              step={0.01}
	                              min={0}
	                              suffix="€"
	                              disabled={!editable}
	                              className="w-full"
	                              inputClassName="h-7 rounded-lg px-2 text-[11px]"
	                              onCommit={(euros) =>
	                                dispatch({ type: 'UPDATE_CHARGE', chargeId: r.id, patch: { amountCents: eurosToCents(euros) } })
	                              }
	                              inputProps={{ 'data-grid': 'charges', 'data-charge-id': r.id, 'data-col': '7' }}
	                            />
	                            <div className="text-right">
	                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ma part</div>
	                              <div className="text-[12px] font-semibold tabular-nums text-slate-100">{formatEUR(r.myShareCents)}</div>
	                            </div>
	                          </div>
	                        </div>
	                      </div>
	                    </div>
	                  </Td>
                  <Td className="hidden text-right sm:table-cell">
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
                  <Td className="hidden text-right sm:table-cell">
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
      ) : (
        <div ref={mobileRef}>
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-slate-400">Aucune charge. Ajoute une ligne pour commencer.</div>
          ) : (
            <div className="space-y-5 px-4 py-4">
              {communRows.length ? (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-sky-200">Commun</div>
                    <div className="text-xs text-slate-400">{communRows.length}</div>
                  </div>
                  <div className="space-y-3">
                    {communRows.map((r, idx) => (
                      <MobileCard
                        key={r.id}
                        r={r}
                        canEdit={canEdit}
                        activeAccounts={activeAccounts}
                        pendingFocusCellRef={pendingFocusCellRef}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < communRows.length - 1}
                        onReorder={(dir) => {
                          const targetId = dir === 'up' ? communRows[idx - 1]?.id : communRows[idx + 1]?.id;
                          if (!targetId) return;
                          reorderInScope('commun', r.id, targetId, dir === 'up' ? 'before' : 'after');
                        }}
                        onTogglePaid={(paid) => dispatch({ type: 'TOGGLE_CHARGE_PAID', ym, chargeId: r.id, paid })}
                        onUpdate={(patch) => dispatch({ type: 'UPDATE_CHARGE', chargeId: r.id, patch })}
                        onRemove={() => dispatch({ type: 'REMOVE_CHARGE', chargeId: r.id })}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {persoRows.length ? (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Perso</div>
                    <div className="text-xs text-slate-400">{persoRows.length}</div>
                  </div>
                  <div className="space-y-3">
                    {persoRows.map((r, idx) => (
                      <MobileCard
                        key={r.id}
                        r={r}
                        canEdit={canEdit}
                        activeAccounts={activeAccounts}
                        pendingFocusCellRef={pendingFocusCellRef}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < persoRows.length - 1}
                        onReorder={(dir) => {
                          const targetId = dir === 'up' ? persoRows[idx - 1]?.id : persoRows[idx + 1]?.id;
                          if (!targetId) return;
                          reorderInScope('perso', r.id, targetId, dir === 'up' ? 'before' : 'after');
                        }}
                        onTogglePaid={(paid) => dispatch({ type: 'TOGGLE_CHARGE_PAID', ym, chargeId: r.id, paid })}
                        onUpdate={(patch) => dispatch({ type: 'UPDATE_CHARGE', chargeId: r.id, patch })}
                        onRemove={() => dispatch({ type: 'REMOVE_CHARGE', chargeId: r.id })}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-white/15 px-4 py-4 text-xs text-slate-400 sm:px-6">
        <span className="sm:hidden">Astuce: ↑/↓ pour réordonner, coche OK quand c’est prélevé.</span>
        <span className="hidden sm:inline">
          Astuce: Entrée pour valider + descendre (Shift+Entrée remonte), Échap pour annuler, glisser ⋮⋮ pour réordonner.
        </span>
      </div>
    </section>
  );
}

function MobileCard({
  r,
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
  r: ReturnType<typeof chargesForMonth>[number];
  canEdit: boolean;
  activeAccounts: Array<{ id: Charge['accountId']; active: boolean }>;
  pendingFocusCellRef: MutableRefObject<{ chargeId: string; col: string } | null>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onReorder: (dir: 'up' | 'down') => void;
  onTogglePaid: (paid: boolean) => void;
  onUpdate: (patch: Partial<Omit<Charge, 'id'>>) => void;
  onRemove: () => void;
}) {
  const tint = r.scope === 'commun' ? 'bg-sky-500/20' : 'bg-emerald-500/20';
  const paidFx = r.paid ? 'opacity-70' : 'opacity-100';

  const typeChip =
    r.scope === 'commun' ? 'border-sky-200/30 bg-sky-400/15 text-sky-50' : 'border-emerald-200/30 bg-emerald-400/15 text-emerald-50';
  const paymentChip =
    r.payment === 'auto' ? 'border-violet-200/30 bg-violet-400/15 text-violet-50' : 'border-amber-200/30 bg-amber-400/15 text-amber-50';

  const metaSelect =
    'h-9 rounded-2xl border border-white/15 bg-ink-950/35 px-3 text-xs font-semibold uppercase tracking-wide text-slate-100 shadow-inner shadow-black/20 outline-none transition-colors duration-150 focus:border-white/25 focus:bg-ink-950/45 sm:h-6 sm:rounded-lg sm:px-2 sm:text-[10px]';
  const ioSelect =
    'h-10 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-3 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 outline-none transition-colors duration-150 focus:border-white/25 focus:bg-ink-950/45';

  const hasAccountId = typeof r.accountId === 'string' && r.accountId.length > 0;
  const accountInActiveList = hasAccountId ? activeAccounts.some((a) => a.id === r.accountId) : false;
  const accountValue = accountInActiveList ? r.accountId : hasAccountId ? '__UNAVAILABLE__' : '';
  const destinationAccountId = r.destination?.kind === 'account' ? r.destination.accountId : '';
  const destinationInActiveList = destinationAccountId ? activeAccounts.some((a) => a.id === destinationAccountId) : false;
  const destinationValue = destinationInActiveList ? destinationAccountId : destinationAccountId ? '__UNAVAILABLE__' : '';

  return (
    <div className={cx('rounded-3xl border border-white/10 p-4 shadow-[0_12px_40px_-30px_rgba(0,0,0,0.75)]', tint, paidFx)}>
      <div className="flex items-start gap-3">
        <div className="pt-1">
          <input
            type="checkbox"
            checked={r.paid}
            disabled={!canEdit}
            onChange={(e) => onTogglePaid(e.target.checked)}
            aria-label={`Prélevé: ${r.name}`}
            className="h-5 w-5 rounded border-white/20 bg-white/5 text-emerald-400"
            data-grid="charges"
            data-charge-id={r.id}
            data-col="0"
          />
        </div>

        <div className="min-w-0 flex-1">
          <InlineTextInput
            ariaLabel="Libellé"
            value={r.name}
            disabled={!canEdit}
            className={cx(
              'h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-[15px] font-semibold text-slate-100 outline-none ring-0 focus:border-white/15 focus:bg-white/10',
              r.paid && 'line-through decoration-white/25',
            )}
            onCommit={(name) => onUpdate({ name })}
            inputProps={{ 'data-grid': 'charges', 'data-charge-id': r.id, 'data-col': '1' }}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[11px] font-semibold text-slate-400">
                J
              </div>
              <InlineTextInput
                ariaLabel="Jour du prélèvement (1 à 31)"
                value={pad2(r.dayOfMonth)}
                disabled={!canEdit}
                className="h-9 w-[74px] rounded-2xl border border-white/15 bg-ink-950/35 pl-7 pr-2 text-sm font-semibold tabular-nums text-slate-100 outline-none ring-0 focus:border-white/25 focus:bg-ink-950/45"
                onCommit={(raw) => {
                  const digits = raw.replace(/[^\d]/g, '');
                  if (!digits) return;
                  const n = Number.parseInt(digits, 10);
                  if (!Number.isFinite(n)) return;
                  const clamped = Math.max(1, Math.min(31, n));
                  if (clamped === r.dayOfMonth) return;
                  onUpdate({ dayOfMonth: clamped });
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

            <select
              className={cx(metaSelect, typeChip)}
              value={r.scope}
              onChange={(e) => onUpdate({ scope: e.target.value as ChargeScope })}
              aria-label="Type"
              data-grid="charges"
              data-charge-id={r.id}
              data-col="3"
              disabled={!canEdit}
            >
              <option value="commun">Commun</option>
              <option value="perso">Perso</option>
            </select>

            <select
              className={cx(metaSelect, paymentChip)}
              value={r.payment}
              onChange={(e) => onUpdate({ payment: e.target.value as Charge['payment'] })}
              aria-label="Paiement"
              data-grid="charges"
              data-charge-id={r.id}
              data-col="4"
              disabled={!canEdit}
            >
              <option value="auto">Auto</option>
              <option value="manuel">Manuel</option>
            </select>
          </div>

          <div className="mt-3 grid gap-2">
            <label className="grid gap-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Compte</div>
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
                data-charge-id={r.id}
                data-col="5"
                disabled={!canEdit}
              >
                <option value="" disabled>
                  Choisir…
                </option>
                {accountValue === '__UNAVAILABLE__' ? (
                  <option value="__UNAVAILABLE__" disabled>
                    Inconnu: {String(r.accountId)}
                  </option>
                ) : null}
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Destination</div>
              {r.destination?.kind === 'text' ? (
                <div className="flex min-w-0 items-center gap-2">
                  <InlineTextInput
                    ariaLabel="Destination (texte)"
                    value={r.destination.text}
                    placeholder="Destination…"
                    disabled={!canEdit}
                    className="h-10 w-full min-w-0 rounded-2xl border border-white/15 bg-ink-950/35 px-3 text-sm font-medium text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-white/25 focus:bg-ink-950/45"
                    onCommit={(text) => {
                      const next = text.trim();
                      onUpdate({ destination: next ? { kind: 'text', text: next } : null });
                    }}
                    inputProps={{ 'data-grid': 'charges', 'data-charge-id': r.id, 'data-col': '6' }}
                  />
                  <button
                    className="h-10 flex-none rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
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
                  value={r.destination?.kind === 'account' ? destinationValue : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      onUpdate({ destination: null });
                      return;
                    }
                    if (v === '__UNAVAILABLE__') return;
                    if (v === '__TEXT__') {
                      pendingFocusCellRef.current = { chargeId: r.id, col: '6' };
                      onUpdate({ destination: { kind: 'text', text: '' } });
                      return;
                    }
                    onUpdate({ destination: { kind: 'account', accountId: v as Charge['accountId'] } });
                  }}
                  aria-label="Destination"
                  data-grid="charges"
                  data-charge-id={r.id}
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
                      {a.id}
                    </option>
                  ))}
                  <option value="__TEXT__">Autre…</option>
                </select>
              )}
            </label>
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <label className="grid gap-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Montant</div>
              <InlineNumberInput
                ariaLabel="Montant (euros)"
                value={centsToEuros(r.amountCents)}
                step={0.01}
                min={0}
                suffix="€"
                disabled={!canEdit}
                className="w-full"
                inputClassName="h-10 rounded-2xl px-3 text-sm"
                onCommit={(euros) => onUpdate({ amountCents: eurosToCents(euros) })}
                inputProps={{ 'data-grid': 'charges', 'data-charge-id': r.id, 'data-col': '7' }}
              />
            </label>
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ma part</div>
              <div className="text-base font-semibold tabular-nums text-slate-100">{formatEUR(r.myShareCents)}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <button
              type="button"
              className="h-9 w-9 text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
              onClick={() => onReorder('up')}
              aria-label="Monter"
              disabled={!canEdit || !canMoveUp}
            >
              ↑
            </button>
            <button
              type="button"
              className="h-9 w-9 border-l border-white/10 text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
              onClick={() => onReorder('down')}
              aria-label="Descendre"
              disabled={!canEdit || !canMoveDown}
            >
              ↓
            </button>
          </div>
          <button
            className={cx(
              'h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-slate-200 transition-colors duration-150 hover:bg-white/10',
              !canEdit && 'opacity-40',
            )}
            disabled={!canEdit}
            onClick={onRemove}
            aria-label={`Supprimer ${r.name}`}
            type="button"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
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
