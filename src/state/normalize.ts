import type { Account, AppState, Charge, ChargeScope } from './types';
import { eurosToCents } from '../lib/money';
import { uid } from '../lib/id';

const REQUIRED_ACCOUNTS: Account[] = [
  { id: 'BS_PERSO', name: 'BS_PERSO', kind: 'perso', active: true },
  { id: 'CA_PERSO', name: 'CA_PERSO', kind: 'perso', active: true },
  { id: 'LCL_PERSO', name: 'LCL_PERSO', kind: 'perso', active: true },
  { id: 'CC_CA', name: 'CC_CA', kind: 'commun', active: true },
  { id: 'CC_LCL', name: 'CC_LCL', kind: 'commun', active: true },
  { id: 'BS_HIDAYA', name: 'BS_HIDAYA', kind: 'perso', active: true },
  { id: 'BS_IMANI', name: 'BS_IMANI', kind: 'perso', active: true },
];

export function normalizeState(state: AppState): AppState {
  let changed = false;

  const nextModifiedAt = (() => {
    const current = typeof state.modifiedAt === 'string' ? state.modifiedAt : null;
    if (current) return current;
    changed = true;
    const candidates: string[] = [];
    for (const m of Object.values(state.months)) {
      if (typeof (m as { updatedAt?: unknown }).updatedAt === 'string') candidates.push(m.updatedAt);
      if (typeof (m as { createdAt?: unknown }).createdAt === 'string') candidates.push(m.createdAt);
    }
    candidates.sort();
    return candidates[candidates.length - 1] ?? new Date().toISOString();
  })();

  // Salary (migrate old default)
  const nextSalaryCents = state.salaryCents === eurosToCents(3400) ? eurosToCents(3968.79) : state.salaryCents;
  if (nextSalaryCents !== state.salaryCents) changed = true;

  // Accounts
  const existing = new Set(state.accounts.map((a) => a.id));
  const missing = REQUIRED_ACCOUNTS.filter((a) => !existing.has(a.id));
  const withMissing = missing.length ? (changed = true, [...state.accounts, ...missing]) : state.accounts;
  let accounts = withMissing.map((a) => {
    const active = typeof (a as { active?: unknown }).active === 'boolean' ? a.active : true;
    const fixedName = a.id;
    const changedThis = fixedName !== a.name || active !== (a as { active?: unknown }).active;
    if (changedThis) changed = true;
    return { ...a, name: fixedName, active };
  });
  if (accounts.length && accounts.every((a) => !a.active)) {
    changed = true;
    const idx = Math.max(
      0,
      accounts.findIndex((a) => a.id === 'BS_PERSO'),
    );
    accounts = accounts.map((a, i) => (i === idx ? { ...a, active: true } : a));
  }

  // Charges: ensure sortOrder exists (older saves won't have it)
  const chargesNeedSortOrder = state.charges.some((c) => typeof (c as Charge).sortOrder !== 'number');
  let charges = chargesNeedSortOrder
    ? (() => {
        changed = true;
        const next = state.charges.map((c) => ({ ...c })) as Charge[];
        const scopes: ChargeScope[] = ['commun', 'perso'];
        const orderById = new Map<string, number>();
        for (const scope of scopes) {
          const group = next
            .filter((c) => c.scope === scope)
            .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.name.localeCompare(b.name));
          group.forEach((c, idx) => orderById.set(c.id, (idx + 1) * 10));
        }
        return next.map((c) => ({ ...c, sortOrder: orderById.get(c.id) ?? 9999 }));
      })()
    : state.charges;

  // Ensure key CA_PERSO charges exist (idempotent).
  const ensureCharges = [
    { name: 'Groupe', amountCents: eurosToCents(25), sortOrder: 25, dayOfMonth: 1 },
    { name: 'Frais CA (perso)', amountCents: eurosToCents(7.1), sortOrder: 27, dayOfMonth: 5 },
  ] as const;

  const normalizeNameKey = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  let chargesChanged = false;
  let nextCharges = charges;
  for (const t of ensureCharges) {
    const idx = nextCharges.findIndex(
      (c) => c.scope === 'perso' && c.accountId === 'CA_PERSO' && normalizeNameKey(c.name) === normalizeNameKey(t.name),
    );
    if (idx === -1) {
      chargesChanged = true;
      nextCharges = [
        ...nextCharges,
        {
          id: uid('chg'),
          name: t.name,
          amountCents: t.amountCents,
          sortOrder: t.sortOrder,
          dayOfMonth: t.dayOfMonth,
          accountId: 'CA_PERSO',
          scope: 'perso',
          payment: 'auto',
          active: true,
        },
      ];
      continue;
    }

    const cur = nextCharges[idx]!;
    const patch: Partial<Charge> = {};
    if (cur.amountCents !== t.amountCents) patch.amountCents = t.amountCents;
    if (cur.dayOfMonth !== t.dayOfMonth) patch.dayOfMonth = t.dayOfMonth;
    if (cur.payment !== 'auto') patch.payment = 'auto';
    if (cur.active !== true) patch.active = true;

    if (Object.keys(patch).length) {
      chargesChanged = true;
      nextCharges = nextCharges.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    }
  }
  if (chargesChanged) {
    changed = true;
    charges = nextCharges;
  }

  // Archived month snapshots: ensure snapshot.sortOrder exists for stable display.
  const chargeById = new Map<string, Charge>(charges.map((c) => [c.id, c]));
  const months = (() => {
    let monthsChanged = false;
    const nextMonths = { ...state.months };
    for (const [ym, month] of Object.entries(state.months)) {
      const entries = Object.entries(month.charges).filter(([, st]) => Boolean(st.snapshot)) as Array<
        [string, { paid: boolean; snapshot: NonNullable<(typeof month.charges)[string]['snapshot']> }]
      >;
      const missingSnapshotOrder = entries.some(([, st]) => typeof (st.snapshot as { sortOrder?: unknown }).sortOrder !== 'number');
      if (!missingSnapshotOrder) continue;

      monthsChanged = true;
      const sorted = [...entries].sort((a, b) => {
        const sa = a[1].snapshot;
        const sb = b[1].snapshot;
        return sa.dayOfMonth - sb.dayOfMonth || sa.name.localeCompare(sb.name);
      });
      const fallback = new Map<string, number>();
      sorted.forEach(([id], idx) => fallback.set(id, (idx + 1) * 10));

      const nextCharges = { ...month.charges };
      for (const [id, st] of entries) {
        const current = st.snapshot as { sortOrder?: unknown };
        if (typeof current.sortOrder === 'number') continue;
        const fromCharge = chargeById.get(id)?.sortOrder;
        const nextSnap = { ...st.snapshot, sortOrder: typeof fromCharge === 'number' ? fromCharge : (fallback.get(id) ?? 9999) };
        nextCharges[id] = { ...st, snapshot: nextSnap };
      }
      nextMonths[ym as keyof typeof nextMonths] = { ...month, charges: nextCharges };
    }
    if (!monthsChanged) return state.months;
    changed = true;
    return nextMonths;
  })();

  if (!changed) return state;
  return {
    ...state,
    modifiedAt: nextModifiedAt,
    salaryCents: nextSalaryCents,
    accounts,
    charges,
    months,
  };
}
