import { useEffect, useMemo, useRef, useState, type KeyboardEventHandler } from 'react';
import { centsToEuros, eurosToCents, formatEUR } from '../lib/money';
import { chargesForMonth } from '../state/selectors';
import { useStoreState } from '../state/store';
import { pad2, ymFromDate, type YM } from '../lib/date';
import type { Charge, ChargeScope } from '../state/types';
import { cx } from './cx';
import { InlineNumberInput, InlineTextInput } from './components/InlineInput';
import { ChargeMobileList } from './charges/ChargeMobileList';

function normalizeSearch(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function ChargesTable({ ym, archived }: { ym: YM; archived: boolean }) {
  const { state, dispatch } = useStoreState();
  const rows = useMemo(
    () => chargesForMonth(state, ym),
    [state.accounts, state.charges, state.months, ym],
  );
  const activeAccounts = useMemo(() => state.accounts.filter((a) => a.active), [state.accounts]);
  const activeAccountIds = useMemo(() => new Set(activeAccounts.map((a) => a.id)), [activeAccounts]);
  const accountsById = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts]);
  const chargesById = useMemo(() => new Map(state.charges.map((c) => [c.id, c])), [state.charges]);
  const monthChargeStateById = state.months[ym]?.charges ?? {};
  const tableRef = useRef<HTMLTableElement | null>(null);
  const mobileRef = useRef<HTMLDivElement | null>(null);
  const [isTableUp, setIsTableUp] = useState<boolean>(() => {
    try {
      return window.matchMedia('(min-width: 768px)').matches;
    } catch {
      return true;
    }
  });
  const prevRowIdsRef = useRef<string[]>([]);
  const pendingFocusColRef = useRef<string | null>(null);
  const pendingFocusCellRef = useRef<{ chargeId: string; col: string } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; scope: ChargeScope } | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);
  const [filter, setFilter] = useState('');
  const [chargesOpen, setChargesOpen] = useState(true);
  const filterNorm = useMemo(() => normalizeSearch(filter.trim()), [filter]);
  const isFiltering = filterNorm.length > 0;
  const [flashRowId, setFlashRowId] = useState<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const todayYm = useMemo(() => ymFromDate(new Date()), []);

  const canEdit = !archived;
  const isMonthOnlyCharge = (chargeId: string) => !chargesById.has(chargeId) && Boolean(monthChargeStateById[chargeId]?.snapshot);
  const updateCharge = (chargeId: string, patch: Partial<Omit<Charge, 'id' | 'active'>>) => {
    if (!canEdit) return;
    if (chargesById.has(chargeId)) {
      dispatch({ type: 'UPDATE_CHARGE', chargeId, patch });
      return;
    }
    dispatch({ type: 'UPDATE_MONTH_CHARGE', ym, chargeId, patch });
  };
  const removeCharge = (chargeId: string) => {
    if (!canEdit) return;
    if (chargesById.has(chargeId)) {
      if (ym < todayYm) {
        dispatch({ type: 'HIDE_CHARGE_FOR_MONTH', ym, chargeId });
      } else {
        dispatch({ type: 'REMOVE_CHARGE', chargeId });
      }
      return;
    }
    dispatch({ type: 'REMOVE_MONTH_CHARGE', ym, chargeId });
  };
  const reorderableIds = (scope: ChargeScope) => rows.filter((r) => r.scope === scope && chargesById.has(r.id)).map((r) => r.id);

  useEffect(() => {
    try {
      const mq = window.matchMedia('(min-width: 768px)');
      setIsTableUp(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setIsTableUp(e.matches);
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
        const root = isTableUp ? tableRef.current : mobileRef.current;
        const el = root?.querySelector<HTMLElement>(`[data-grid="charges"][data-charge-id="${chargeId}"][data-col="${col}"]`) ?? null;
        if (!el) return;
        el.scrollIntoView({ block: 'center' });
        el.focus();
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
  }, [isTableUp, rows]);

  useEffect(() => {
    if (!flashRowId) return;
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashRowId(null), 1400);
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    };
  }, [flashRowId]);

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
    const groupIds = reorderableIds(scope);
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

  const visibleRows = useMemo(() => {
    if (!filterNorm) return rows;
    return rows.filter((r) => {
      const hay = normalizeSearch(
        [
          r.name,
          r.accountName,
          r.destinationLabel ?? '',
          r.scope === 'commun' ? 'commun' : 'perso',
          r.payment === 'auto' ? 'auto' : 'manuel',
        ].join(' '),
      );
      return hay.includes(filterNorm);
    });
  }, [filterNorm, rows]);

  return (
    <section
      data-tour="charges"
      className="fm-panel motion-hover motion-pop overflow-hidden"
    >
          <div className="relative border-b border-white/15 bg-ink-950/75 px-4 py-4 max-[360px]:px-3 max-[360px]:py-3 sm:px-6 sm:py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm text-slate-300">Charges</h2>
                <div className="mt-1 text-xl font-semibold tracking-tight text-shadow-2xs">
                  {visibleRows.length} lignes
                  {isFiltering ? <span className="ml-2 text-sm font-medium text-slate-400">/ {rows.length}</span> : null}
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-[360px]:w-full max-[360px]:gap-1.5">
                <button
                  type="button"
                  className="fm-mobile-section-toggle sm:hidden"
                  onClick={() => setChargesOpen((v) => !v)}
                  aria-expanded={chargesOpen}
                  aria-label={chargesOpen ? 'Masquer les charges' : 'Afficher les charges'}
                  title={chargesOpen ? 'Masquer les charges' : 'Afficher les charges'}
                >
                  <span>{chargesOpen ? 'Replier' : 'Voir'} charges</span>
                  <span aria-hidden="true" className="fm-mobile-section-toggle-icon">
                    {chargesOpen ? '−' : '+'}
                  </span>
                </button>
                <button
                  type="button"
                  className="fm-btn-ghost hidden h-10 w-10 items-center justify-center text-sm max-[360px]:h-9 max-[360px]:w-9 sm:flex"
                  onClick={() => setChargesOpen((v) => !v)}
                  aria-expanded={chargesOpen}
                  aria-label={chargesOpen ? 'Masquer les charges' : 'Afficher les charges'}
                  title={chargesOpen ? 'Masquer les charges' : 'Afficher les charges'}
                >
                  <span aria-hidden="true" className="text-[18px] font-semibold leading-none">
                    {chargesOpen ? '▴' : '▾'}
                  </span>
                </button>
                <button
                  data-tour="add-charge"
                  className={cx(
                    'fm-btn-ghost rounded-2xl px-4 py-2 text-sm max-[360px]:px-3 max-[360px]:py-1.5 max-[360px]:text-xs',
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
                <button
                  className={cx(
                    'fm-btn-ghost rounded-2xl px-4 py-2 text-sm max-[360px]:px-3 max-[360px]:py-1.5 max-[360px]:text-xs',
                    !canEdit && 'opacity-50',
                  )}
                  disabled={!canEdit}
                  title="Ajoute une charge uniquement pour ce mois (ponctuelle)"
                  onClick={() => {
                    const defaultAccount = activeAccounts[0]?.id ?? state.accounts[0]?.id ?? 'PERSONAL_MAIN';
                    pendingFocusColRef.current = '1';
                    dispatch({
                      type: 'ADD_MONTH_CHARGE',
                      ym,
                      charge: {
                        name: 'Dépense ponctuelle',
                        amountCents: 0,
                        dayOfMonth: 1,
                        accountId: defaultAccount,
                        scope: 'perso',
                        payment: 'manuel',
                        destination: null,
                      },
                    });
                  }}
                >
                  + Ponctuelle
                </button>
              </div>
            </div>

            {chargesOpen ? (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      className="fm-input h-10 rounded-2xl px-4 pr-10 text-sm"
                      placeholder="Filtrer… (libellé, compte, destination)"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      inputMode="search"
                      aria-label="Filtrer les charges"
                    />
                    {filter ? (
                      <button
                        type="button"
                        className="fm-btn-ghost absolute inset-y-0 right-2 my-auto h-8 w-8 text-sm text-slate-200"
                        onClick={() => setFilter('')}
                        aria-label="Effacer le filtre"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                  <div className="flex-none text-xs text-slate-400 tabular-nums">{visibleRows.length}</div>
                </div>
                {isFiltering ? (
                  <div className="mt-2 text-[11px] text-slate-400">Réordonnancement désactivé pendant le filtre.</div>
                ) : null}
              </>
            ) : null}
          </div>

        {chargesOpen ? isTableUp ? (
        <div className="overflow-x-auto overscroll-x-contain">
          <table ref={tableRef} onKeyDown={onGridKeyDown} className="min-w-full table-fixed border-separate border-spacing-0">
            <caption className="sr-only">
              Liste des charges du mois.
              <span id="charges-reorder-help">
                Pour réordonner une ligne, utilise le bouton “⋮⋮” puis glisser-déposer (ou{' '}
                <span className="font-mono">Alt</span>+<span className="font-mono">↑</span>/<span className="font-mono">↓</span>).
              </span>
            </caption>
                  <thead className="bg-ink-950/95">
              <tr className="text-left text-xs text-slate-400">
                <Th className="w-[76px] sm:w-[88px]">OK</Th>
                <Th>Libellé</Th>
                <Th className="hidden w-[120px] text-right sm:table-cell">Montant</Th>
                <Th className="hidden w-[120px] text-right sm:table-cell">Ma part</Th>
                <Th className="w-[56px]" ariaHidden />
              </tr>
            </thead>
              <tbody className="text-[13px] leading-tight">
                {visibleRows.map((r) => {
                const model = chargesById.get(r.id) ?? null;
                const isMonthOnly = isMonthOnlyCharge(r.id);
                const editable = canEdit && (Boolean(model) || isMonthOnly);
                const canReorder = canEdit && Boolean(model) && !isFiltering;
                const isInactive = Boolean(model && !model.active);
              const monthOnlyChip = 'border-slate-200/30 bg-slate-400/15 text-slate-50';
              const tint =
                r.scope === 'commun'
                  ? 'bg-sky-500/22 hover:bg-sky-500/34'
                  : 'bg-emerald-500/22 hover:bg-emerald-500/34';
              const leftAccent = r.scope === 'commun' ? 'border-l-4 border-sky-300/70' : 'border-l-4 border-emerald-300/70';
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
                  'fm-input-select h-6 rounded-lg px-2 text-[10px] font-semibold uppercase tracking-wide shadow-inner shadow-black/20';
                const ioSelectBase =
                  'fm-input-select min-w-0 max-w-full h-7 rounded-lg px-2 text-[11px] font-medium shadow-inner shadow-black/20';
                const hasAccountId = typeof r.accountId === 'string' && r.accountId.length > 0;
                const account = hasAccountId ? accountsById.get(r.accountId) ?? null : null;
                const accountInActiveList = hasAccountId ? activeAccountIds.has(r.accountId) : false;
                const accountValue = accountInActiveList ? r.accountId : hasAccountId ? '__UNAVAILABLE__' : '';
                const accountUnavailableLabel = account ? `Supprimé: ${account.id}` : `Inconnu: ${String(r.accountId)}`;

                const destinationAccountId = r.destination?.kind === 'account' ? r.destination.accountId : '';
                const destinationAccount = destinationAccountId ? accountsById.get(destinationAccountId) ?? null : null;
                const destinationInActiveList = destinationAccountId ? activeAccountIds.has(destinationAccountId) : false;
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
                      r.id === flashRowId && 'ring-2 ring-slate-200/30 ring-inset',
                      dragging?.id === r.id && 'opacity-60',
                      dragOver?.id === r.id && dragging?.scope === r.scope
                        ? dragOver.pos === 'before'
                          ? 'shadow-[inset_0_2px_0_rgba(189,147,249,0.85)]'
                          : 'shadow-[inset_0_-2px_0_rgba(189,147,249,0.85)]'
                      : null,
                    )}
                  onDragOver={(e) => {
                    if (!canEdit) return;
                    if (!model) return;
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
                    if (!model) return;
                    const srcId = e.dataTransfer.getData('text/plain') || dragging?.id || '';
                    if (!srcId || srcId === r.id) return;
                    if (dragging?.scope !== r.scope) return;
                    if (!chargesById.has(srcId)) return;
                    e.preventDefault();
                    reorderInScope(r.scope, srcId, r.id, dragOver?.id === r.id ? dragOver.pos : 'before');
                    setDragging(null);
                    setDragOver(null);
                  }}
                >
                  <Td className={cx('w-[76px] sm:w-[88px]', leftAccent)}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          draggable={canReorder}
                          disabled={!canReorder}
                          className={cx(
                            'fm-btn-ghost rounded-md px-1.5 py-1 text-[10px] leading-none text-slate-200',
                            !canReorder && 'opacity-40',
                          )}
                          aria-label={`Réordonner: ${r.name}`}
                          aria-describedby="charges-reorder-help"
                          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                          title="Glisser-déposer pour réordonner (Alt+↑/↓)"
                          onDragStart={(e) => {
                            if (!canReorder) {
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
                            if (!canReorder) return;
                            if (!e.altKey) return;
                            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                            e.preventDefault();
                            const groupIds = reorderableIds(r.scope);
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
                        className={cx(
                          'h-4 w-4 rounded border-white/20 bg-white/5',
                          r.scope === 'commun' ? 'text-sky-400' : 'text-emerald-400',
                        )}
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
                              'fm-input h-8 rounded-lg px-2 text-[13px] font-medium ring-0',
                              r.paid && 'line-through decoration-white/25',
                            )}
                            onCommit={(name) => updateCharge(r.id, { name })}
                            inputProps={{ 'data-grid': 'charges', 'data-charge-id': r.id, 'data-col': '1' }}
                          />
                          <div className="mt-2 grid gap-2 text-[11px] text-slate-200/90">
                            <div
                              className={cx(
                                'fm-inline-panel flex flex-wrap items-center gap-2 px-2 py-1',
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
                                    className="fm-input h-5 w-[34px] rounded-lg pl-3 pr-0.5 text-[8px] font-semibold tabular-nums ring-0"
                                    onCommit={(raw) => {
                                      const digits = raw.replace(/[^\d]/g, '');
                                      if (!digits) return;
                                      const n = Number.parseInt(digits, 10);
                                      if (!Number.isFinite(n)) return;
                                      const clamped = Math.max(1, Math.min(31, n));
                                      if (clamped === r.dayOfMonth) return;
                                      updateCharge(r.id, { dayOfMonth: clamped });
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
                                  className="fm-chip-field inline-flex h-5 items-center px-1 text-[8px] font-semibold tabular-nums"
                                >
                                  J{pad2(r.dayOfMonth)}
                                </span>
                              )}

                                {editable ? (
                                  <select
                                    className={cx(metaSelect, typeChip)}
                                    value={r.scope}
                                    onChange={(e) => {
                                      pendingFocusCellRef.current = { chargeId: r.id, col: '3' };
                                      setFlashRowId(r.id);
                                      updateCharge(r.id, { scope: e.target.value as ChargeScope });
                                    }}
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
                                  onChange={(e) => updateCharge(r.id, { payment: e.target.value as Charge['payment'] })}
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

                              {isMonthOnly ? (
                                <span
                                  title="Charge uniquement pour ce mois"
                                  className={cx(
                                    'inline-flex h-6 items-center rounded-lg border px-2 text-[10px] font-semibold uppercase tracking-wide',
                                    monthOnlyChip,
                                  )}
                                >
                                  Ponctuelle
                                </span>
                              ) : null}

                              {isInactive ? (
                                <span className="inline-flex h-6 items-center rounded-full bg-white/10 px-2 text-[10px] text-slate-200">
                                  inactif
                                </span>
                              ) : null}
                            </div>

                            <div
                              className={cx(
                                'fm-inline-panel grid w-full max-w-[360px] min-w-0 justify-self-start grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden px-2 py-1',
                                !editable && 'opacity-70',
                              )}
                            >
                            {editable ? (
                              <select
                                className={cx(ioSelectBase, 'w-full truncate')}
                                value={accountValue}
                                title={r.accountName}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (!v || v === '__UNAVAILABLE__') return;
                                    updateCharge(r.id, { accountId: v as Charge['accountId'] });
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
                                      {a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  className="fm-chip-field min-w-0 wrap-break-word px-2 py-1 text-[11px] font-medium"
                                  title={r.accountName}
                                >
                                  {r.accountName}
                                </span>
                              )}

                            <span className="select-none text-slate-400" aria-hidden="true">
                              →
                            </span>

                            {editable ? (
                              r.destination?.kind === 'text' ? (
                                <div className="flex min-w-0 items-center gap-1">
                                    <InlineTextInput
                                      ariaLabel="Destination (texte)"
                                      value={r.destination.text}
                                      placeholder="Destination…"
                                      disabled={!editable}
                                      className="fm-input h-7 w-full min-w-0 rounded-lg px-2 text-[11px] font-medium ring-0"
                                      onCommit={(text) => {
                                        const next = text.trim();
                                        updateCharge(r.id, { destination: next ? { kind: 'text', text: next } : null });
                                      }}
                                      inputProps={{ 'data-grid': 'charges', 'data-charge-id': r.id, 'data-col': '6' }}
                                    />
                                    <button
                                      className="fm-btn-ghost h-7 flex-none rounded-lg px-2 text-[11px] text-slate-200"
                                      onClick={() => updateCharge(r.id, { destination: null })}
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
                                        updateCharge(r.id, { destination: null });
                                        return;
                                      }
                                      if (v === '__UNAVAILABLE__') return;
                                      if (v === '__TEXT__') {
                                        pendingFocusCellRef.current = { chargeId: r.id, col: '6' };
                                        updateCharge(r.id, { destination: { kind: 'text', text: '' } });
                                        return;
                                      }
                                      updateCharge(r.id, { destination: { kind: 'account', accountId: v as Charge['accountId'] } });
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
                                        {a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id}
                                      </option>
                                    ))}
                                    <option value="__TEXT__">Autre…</option>
                                  </select>
                              )
                            ) : r.destinationLabel ? (
                              <span
                                className="fm-chip-field min-w-0 wrap-break-word px-2 py-1 text-[11px] font-medium"
                                title={r.destinationLabel}
                              >
                                {r.destinationLabel}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </div>

                          <div className="sm:hidden">
                            <div
                              className={cx(
                                'fm-inline-panel grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2 py-1',
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
                                  onCommit={(euros) => updateCharge(r.id, { amountCents: eurosToCents(euros) })}
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
                        onCommit={(euros) => updateCharge(r.id, { amountCents: eurosToCents(euros) })}
                        inputProps={{ 'data-grid': 'charges', 'data-charge-id': r.id, 'data-col': '7' }}
                      />
                    </Td>
                  <Td className="hidden text-right sm:table-cell">
                    <div className="text-[13px] font-semibold tabular-nums text-slate-100">{formatEUR(r.myShareCents)}</div>
                  </Td>
                  <Td className="text-right">
                    <button
                      className={cx(
                        'fm-btn-ghost px-3 py-2 text-xs',
                        !editable && 'opacity-40',
                        )}
                        disabled={!editable}
                        onClick={() => removeCharge(r.id)}
                        aria-label={`Supprimer ${r.name}`}
                      >
                        ✕
                    </button>
                  </Td>
                </tr>
              );
            })}
              {visibleRows.length === 0 ? (
                <tr>
                  <Td colSpan={5} className="py-10 text-center text-slate-400">
                    {rows.length === 0 ? 'Aucune charge. Ajoute une ligne pour commencer.' : 'Aucun résultat.'}
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        ) : (
          <div ref={mobileRef}>
            <ChargeMobileList
              rows={visibleRows}
              canEdit={canEdit}
              isFiltering={isFiltering}
              flashRowId={flashRowId}
              activeAccounts={activeAccounts}
              pendingFocusCellRef={pendingFocusCellRef}
              emptyLabel={rows.length === 0 ? 'Aucune charge. Ajoute une ligne pour commencer.' : 'Aucun résultat.'}
              hasPersistentCharge={(chargeId) => chargesById.has(chargeId)}
              isMonthOnlyCharge={isMonthOnlyCharge}
              onReorderInScope={reorderInScope}
              onTogglePaid={(chargeId, paid) => dispatch({ type: 'TOGGLE_CHARGE_PAID', ym, chargeId, paid })}
              onUpdate={(chargeId, patch) => {
                if ('scope' in patch) {
                  pendingFocusCellRef.current = { chargeId, col: '3' };
                  setFlashRowId(chargeId);
                }
                updateCharge(chargeId, patch);
              }}
              onRemove={removeCharge}
            />
          </div>
        )
      : null}

      <div className="border-t border-white/15 px-4 py-4 text-xs text-slate-400 max-[360px]:px-3 max-[360px]:py-3 sm:px-6">
        <span className="sm:hidden">Astuce: ↑/↓ pour réordonner, coche OK quand c’est prélevé.</span>
        <span className="hidden sm:inline">
          Astuce: Entrée pour valider + descendre (Shift+Entrée remonte), Échap pour annuler, glisser ⋮⋮ pour réordonner.
        </span>
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
