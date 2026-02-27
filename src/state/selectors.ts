import { dueDateIso, pad2, ymAdd, type YM } from '../lib/date';
import type {
  Account,
  AccountId,
  AppState,
  Budget,
  BudgetExpense,
  ChargeDestination,
  ChargePayment,
  ChargeScope,
  MonthBudgetSnapshot,
  MonthChargeSnapshot,
  MonthData,
} from './types';

export type ChargeResolved = {
  id: string;
  name: string;
  amountCents: number;
  sortOrder: number;
  dayOfMonth: number;
  dueDate: string; // YYYY-MM-DD
  accountId: AccountId;
  accountName: string;
  scope: ChargeScope;
  splitPercent: number;
  payment: ChargePayment;
  destination: ChargeDestination | null;
  destinationLabel: string | null;
  paid: boolean;
  myShareCents: number;
};

export type BudgetResolved = {
  id: string;
  name: string;
  amountCents: number;
  adjustedAmountCents: number;
  fundingCents: number;
  carryOverSourceDebtCents: number;
  carryOverSourceCreditCents: number;
  carryOverSourceTotalCents: number;
  carryOverSourceNetCents: number;
  carryOverHandled: boolean;
  carryOverDebtCents: number;
  carryOverCreditCents: number;
  carryOverTotalCents: number;
  carryOverNetCents: number;
  carryOverDebtMyShareCents: number;
  carryForwardSourceDebtCents: number;
  carryForwardSourceCreditCents: number;
  carryForwardHandled: boolean;
  carryForwardDebtCents: number;
  carryForwardCreditCents: number;
  remainingToFundCents: number;
  baseMyShareCents: number;
  carryOverMyShareCents: number;
  accountId: AccountId;
  accountName: string;
  scope: ChargeScope;
  splitPercent: number;
  myShareCents: number;
  expenses: BudgetExpense[];
  spentCents: number;
  remainingCents: number;
};

type MonthComputedInputs = {
  charges?: ChargeResolved[];
  budgets?: BudgetResolved[];
};

function accountById(accounts: Account[]) {
  const map = new Map<AccountId, Account>();
  for (const a of accounts) map.set(a.id, a);
  return map;
}

function chargeById(charges: AppState['charges']) {
  const map = new Map<string, AppState['charges'][number]>();
  for (const c of charges) map.set(c.id, c);
  return map;
}

function budgetById(budgets: AppState['budgets']) {
  const map = new Map<string, AppState['budgets'][number]>();
  for (const b of budgets) map.set(b.id, b);
  return map;
}

export function getMonth(state: AppState, ym: YM): MonthData | null {
  return state.months[ym] ?? null;
}

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function normalizeNameForMatch(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAutoSavingsChargeName(name: string) {
  const normalized = normalizeNameForMatch(name);
  return (
    normalized === 'epargne' ||
    normalized === 'virement epargne' ||
    normalized.includes('epargne') ||
    // Tolerate common typo: "eparne".
    normalized.includes('eparne')
  );
}

function applyAutoSavingsForMonth(state: AppState, ym: YM, rows: ChargeResolved[]) {
  if (rows.length === 0) return rows;

  const globalById = chargeById(state.charges);
  const candidates = rows
    .map((r) => {
      const global = globalById.get(r.id);
      if (!global || !global.active) return null; // recurring charge only
      if (global.payment !== 'auto') return null;
      if (r.scope !== 'perso') return null;
      if (!isAutoSavingsChargeName(r.name)) return null;

      const normalized = normalizeNameForMatch(r.name);
      const exact =
        normalized === 'epargne' || normalized === 'virement epargne' || normalized === 'eparne' || normalized === 'virement eparne';
      const preferred = normalized.startsWith('virement epargne') || normalized.startsWith('virement eparne');
      const rank = (exact ? 100 : 0) + (preferred ? 10 : 0);
      return { row: r, rank };
    })
    .filter((x): x is { row: ChargeResolved; rank: number } => x !== null)
    .sort((a, b) => {
      if (a.rank !== b.rank) return b.rank - a.rank;
      if (a.row.sortOrder !== b.row.sortOrder) return a.row.sortOrder - b.row.sortOrder;
      return a.row.id.localeCompare(b.row.id);
    });

  if (candidates.length === 0) return rows;
  const savings = candidates[0]!.row;

  const salaryCents = state.months[ym]?.salaryCents ?? state.salaryCents;
  const budgets = budgetsForMonth(state, ym);
  const budgetsToWireCents = budgets.reduce((acc, b) => acc + b.myShareCents, 0);
  const otherChargesTotalCents = rows.reduce((acc, r) => {
    if (r.id === savings.id) return acc;
    return acc + (r.scope === 'commun' ? r.myShareCents : r.amountCents);
  }, 0);
  const savingsFloorCents = Math.max(0, savings.amountCents);
  // Rule: wire envelopes with incoming debt catch-up and positive reliquat applied
  // before allocating extra to Epargne (floor kept).
  const remainingAboveFloorCents = salaryCents - otherChargesTotalCents - budgetsToWireCents - savingsFloorCents;
  const extraSavingsCents = Math.max(0, remainingAboveFloorCents);
  const nextSavingsAmountCents = savingsFloorCents + extraSavingsCents;

  if (savings.amountCents === nextSavingsAmountCents) return rows;
  return rows.map((r) => {
    if (r.id !== savings.id) return r;
    return {
      ...r,
      amountCents: nextSavingsAmountCents,
      myShareCents: nextSavingsAmountCents,
    };
  });
}

function resolveSnapshot(
  month: MonthData | undefined,
  charges: Map<string, AppState['charges'][number]>,
  ym: YM,
  chargeId: string,
  todayIso: string,
): { paid: boolean; snap: MonthChargeSnapshot | null } {
  const monthState = month?.charges[chargeId];
  if (monthState?.snapshot && month?.archived) return { paid: monthState.paid, snap: monthState.snapshot };

  const ch = charges.get(chargeId);
  // Month-only charges (planned/one-off): stored as a snapshot in the month, not in global charges.
  if (!ch && monthState?.snapshot) return { paid: monthState.paid, snap: monthState.snapshot };
  const defaultPaid =
    !month?.archived &&
    !monthState &&
    ch?.payment === 'auto' &&
    dueDateIso(ym, ch?.dayOfMonth ?? 1) <= todayIso;
  const paid = monthState?.paid ?? defaultPaid ?? false;
  if (!ch) return { paid, snap: null };
  return {
    paid,
    snap: {
      name: ch.name,
      amountCents: ch.amountCents,
      sortOrder: ch.sortOrder,
      dayOfMonth: ch.dayOfMonth,
      accountId: ch.accountId,
      scope: ch.scope,
      splitPercent: ch.splitPercent,
      payment: ch.payment,
      destination: ch.destination,
    },
  };
}

export function chargesForMonth(state: AppState, ym: YM): ChargeResolved[] {
  const month = state.months[ym];
  const monthCharges = month?.charges;
  const accounts = accountById(state.accounts);
  const charges = chargeById(state.charges);
  const todayIso = todayIsoLocal();

  const ids: string[] = [];
  const seen = new Set<string>();
  if (month?.archived) {
    for (const [id, st] of Object.entries(month.charges)) {
      if (st.snapshot && !st.removed) {
        ids.push(id);
        seen.add(id);
      }
    }
  } else {
    for (const ch of state.charges) {
      if (!ch.active) continue;
      if (monthCharges?.[ch.id]?.removed) continue;
      ids.push(ch.id);
      seen.add(ch.id);
    }
  }

  // In non-archived months, keep any paid markers even if charge got deactivated.
  if (!month?.archived && month) {
    for (const id of Object.keys(month.charges)) {
      if (month.charges[id]?.removed) continue;
      if (seen.has(id)) continue;
      ids.push(id);
      seen.add(id);
    }
  }

  const rows: ChargeResolved[] = [];
  for (const id of ids) {
    const { paid, snap } = resolveSnapshot(month, charges, ym, id, todayIso);
    if (!snap) continue;
    const splitPercent =
      snap.scope === 'commun'
        ? typeof snap.splitPercent === 'number' && Number.isFinite(snap.splitPercent)
          ? Math.max(0, Math.min(100, Math.round(snap.splitPercent)))
          : 50
        : 100;
    const myShareCents = snap.scope === 'commun' ? Math.round((snap.amountCents * splitPercent) / 100) : snap.amountCents;
    const accName = accounts.get(snap.accountId)?.name ?? snap.accountId;
    const sortOrder = typeof (snap as { sortOrder?: unknown }).sortOrder === 'number' ? snap.sortOrder : 9999;
    const destination = snap.destination ?? null;
    const destinationLabel =
      destination?.kind === 'account'
        ? (accounts.get(destination.accountId)?.name ?? destination.accountId)
        : destination?.kind === 'text'
          ? destination.text
          : null;
    rows.push({
      id,
      name: snap.name,
      amountCents: snap.amountCents,
      sortOrder,
      dayOfMonth: snap.dayOfMonth,
      dueDate: dueDateIso(ym, snap.dayOfMonth),
      accountId: snap.accountId,
      accountName: accName,
      scope: snap.scope,
      splitPercent,
      payment: snap.payment,
      destination,
      destinationLabel,
      paid,
      myShareCents,
    });
  }

  const scopeOrder = (s: ChargeScope) => (s === 'commun' ? 0 : 1);
  rows.sort((a, b) => {
    const t = scopeOrder(a.scope) - scopeOrder(b.scope);
    if (t !== 0) return t;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.dayOfMonth !== b.dayOfMonth) return a.dayOfMonth - b.dayOfMonth;
    return a.name.localeCompare(b.name);
  });
  return applyAutoSavingsForMonth(state, ym, rows);
}

function resolveBudgetSnapshot(
  month: MonthData | undefined,
  budgets: Map<string, AppState['budgets'][number]>,
  budgetId: string,
): { expenses: BudgetExpense[]; carryOverHandled: boolean; carryForwardHandled: boolean; snap: MonthBudgetSnapshot | null } {
  const monthState = month?.budgets[budgetId];
  const expenses = monthState?.expenses ?? [];
  const carryOverHandled = monthState?.carryOverHandled === true;
  const carryForwardHandled = monthState?.carryForwardHandled === true;
  if (month?.archived && monthState?.snapshot) return { expenses, carryOverHandled, carryForwardHandled, snap: monthState.snapshot };

  const b = budgets.get(budgetId);
  if (!b) return { expenses, carryOverHandled, carryForwardHandled, snap: null };
  return {
    expenses,
    carryOverHandled,
    carryForwardHandled,
    snap: { name: b.name, amountCents: b.amountCents, accountId: b.accountId, scope: b.scope, splitPercent: b.splitPercent },
  };
}

export function budgetsForMonth(state: AppState, ym: YM): BudgetResolved[] {
  const month = state.months[ym];
  const accounts = accountById(state.accounts);
  const budgets = budgetById(state.budgets);
  const rowCache = new Map<string, BudgetResolved | null>();
  const firstCarryMonthByBudgetId = new Map<string, YM>();

  for (const [monthKey, monthState] of Object.entries(state.months) as Array<[YM, MonthData]>) {
    for (const [budgetId, budgetMonthState] of Object.entries(monthState.budgets)) {
      const hasCarrySignal =
        Boolean(budgetMonthState.snapshot) ||
        (budgetMonthState.expenses?.length ?? 0) > 0 ||
        budgetMonthState.carryOverHandled === true ||
        budgetMonthState.carryForwardHandled === true;
      if (!hasCarrySignal) continue;

      const currentFirst = firstCarryMonthByBudgetId.get(budgetId);
      if (!currentFirst || monthKey < currentFirst) {
        firstCarryMonthByBudgetId.set(budgetId, monthKey);
      }
    }
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  if (month?.archived) {
    for (const [id, st] of Object.entries(month.budgets)) {
      if (!st.snapshot) continue;
      ids.push(id);
      seen.add(id);
    }
  } else {
    const enabledForMonth = (b: Budget) => {
      if (b.active) return true;
      const inactiveFromYm = b.inactiveFromYm;
      return typeof inactiveFromYm === 'string' ? ym < inactiveFromYm : false;
    };

    for (const b of state.budgets) {
      if (!enabledForMonth(b)) continue;
      ids.push(b.id);
      seen.add(b.id);
    }

    // Keep month expenses visible even if envelope got deleted later.
    if (month) {
      for (const [id, st] of Object.entries(month.budgets)) {
        const hasExpenses = Boolean(st.expenses?.length);
        if (!hasExpenses) continue;
        if (seen.has(id)) continue;
        ids.push(id);
        seen.add(id);
      }
    }
  }

  const resolveBudgetRow = (targetYm: YM, budgetId: string): BudgetResolved | null => {
    const key = `${targetYm}:${budgetId}`;
    const cached = rowCache.get(key);
    if (cached !== undefined) return cached;

    const targetMonth = state.months[targetYm];
    const { expenses, carryOverHandled, carryForwardHandled, snap } = resolveBudgetSnapshot(targetMonth, budgets, budgetId);
    if (!snap) {
      rowCache.set(key, null);
      return null;
    }

    let carryOverSourceDebtCents = 0;
    let carryOverSourceCreditCents = 0;
    const prevYm = ymAdd(targetYm, -1);
    const firstCarryYm = firstCarryMonthByBudgetId.get(budgetId) ?? targetYm;
    if (prevYm >= firstCarryYm) {
      const prev = resolveBudgetRow(prevYm, budgetId);
      carryOverSourceDebtCents = prev?.carryForwardDebtCents ?? 0;
      carryOverSourceCreditCents = prev?.carryForwardCreditCents ?? 0;
    }
    const carryOverSourceTotalCents = carryOverSourceDebtCents + carryOverSourceCreditCents;
    const carryOverSourceNetCents = carryOverSourceCreditCents - carryOverSourceDebtCents;
    const carryOverDebtCents = carryOverHandled ? 0 : carryOverSourceDebtCents;
    const carryOverCreditCents = carryOverHandled ? 0 : carryOverSourceCreditCents;
    const carryOverTotalCents = carryOverDebtCents + carryOverCreditCents;
    const carryOverNetCents = carryOverCreditCents - carryOverDebtCents;

    const spentCents = expenses.reduce((acc, e) => acc + e.amountCents, 0);
    // Incoming debt increases the transfer; incoming positive reliquat reduces it.
    const adjustedAmountCents = snap.amountCents + carryOverDebtCents - carryOverCreditCents;
    const fundingCents = Math.max(0, adjustedAmountCents);
    // UX-facing monthly remainder on the monthly target itself (excluding debt catch-up transfer).
    const remainingToFundCents = snap.amountCents - spentCents;
    // Consolidation basis: what was effectively available this month in the envelope.
    // If incoming reliquat exceeds the target, available starts from that higher amount.
    const availableCents = Math.max(carryOverNetCents, snap.amountCents);
    const remainingCents = availableCents - spentCents;
    const carryForwardSourceDebtCents = Math.max(0, -remainingCents);
    const carryForwardSourceCreditCents = Math.max(0, remainingCents);
    const carryForwardDebtCents = carryForwardHandled ? 0 : carryForwardSourceDebtCents;
    const carryForwardCreditCents = carryForwardSourceCreditCents;
    const accName = accounts.get(snap.accountId)?.name ?? snap.accountId;
    const scope: ChargeScope = snap.scope === 'commun' ? 'commun' : 'perso';
    const splitPercent =
      scope === 'commun'
        ? typeof snap.splitPercent === 'number' && Number.isFinite(snap.splitPercent)
          ? Math.max(0, Math.min(100, Math.round(snap.splitPercent)))
          : 50
        : 100;
    const baseMyShareCents = scope === 'commun' ? Math.round((snap.amountCents * splitPercent) / 100) : snap.amountCents;
    const myShareCents = scope === 'commun' ? Math.round((fundingCents * splitPercent) / 100) : fundingCents;
    const carryOverDebtMyShareCents =
      scope === 'commun' ? Math.round((carryOverDebtCents * splitPercent) / 100) : carryOverDebtCents;
    // Signed reliquat impact on my transfer share:
    // negative => reduces transfer (incoming positive reliquat).
    const carryOverMyShareCents = myShareCents - baseMyShareCents;
    const row = {
      id: budgetId,
      name: snap.name,
      amountCents: snap.amountCents,
      adjustedAmountCents,
      fundingCents,
      carryOverSourceDebtCents,
      carryOverSourceCreditCents,
      carryOverSourceTotalCents,
      carryOverSourceNetCents,
      carryOverHandled,
      carryOverDebtCents,
      carryOverCreditCents,
      carryOverTotalCents,
      carryOverNetCents,
      carryOverDebtMyShareCents,
      carryForwardSourceDebtCents,
      carryForwardSourceCreditCents,
      carryForwardHandled,
      carryForwardDebtCents,
      carryForwardCreditCents,
      remainingToFundCents,
      baseMyShareCents,
      carryOverMyShareCents,
      accountId: snap.accountId,
      accountName: accName,
      scope,
      splitPercent,
      myShareCents,
      expenses,
      spentCents,
      remainingCents,
    } satisfies BudgetResolved;
    rowCache.set(key, row);
    return row;
  };

  const rows: BudgetResolved[] = [];
  for (const id of ids) {
    const row = resolveBudgetRow(ym, id);
    if (row) rows.push(row);
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export function totalsForMonth(state: AppState, ym: YM, precomputed?: MonthComputedInputs) {
  const rows = precomputed?.charges ?? chargesForMonth(state, ym);
  const budgets = precomputed?.budgets ?? budgetsForMonth(state, ym);

  let totalCommunCents = 0;
  let totalCommunPartCents = 0;
  let totalPersoCents = 0;
  let totalPourMoiCents = 0;
  let pendingCount = 0;

  for (const r of rows) {
    if (!r.paid) pendingCount += 1;

    if (r.scope === 'commun') {
      totalCommunCents += r.amountCents;
      totalCommunPartCents += r.myShareCents;
    } else {
      totalPersoCents += r.amountCents;
    }
    totalPourMoiCents += r.scope === 'commun' ? r.myShareCents : r.amountCents;
  }

  const salaryCents = state.months[ym]?.salaryCents ?? state.salaryCents;
  const totalBudgetsBaseCents = budgets.reduce((acc, b) => acc + b.baseMyShareCents, 0);
  const totalBudgetsCarryOverCents = budgets.reduce((acc, b) => acc + b.carryOverMyShareCents, 0);
  const totalBudgetsCents = budgets.reduce((acc, b) => acc + b.myShareCents, 0);
  const totalBudgetSpentCents = budgets.reduce((acc, b) => acc + b.spentCents, 0);
  const totalPourMoiAvecEnveloppesCents = totalPourMoiCents + totalBudgetsCents;

  return {
    salaryCents,
    totalCommunCents,
    totalCommunPartCents,
    totalPersoCents,
    totalPourMoiCents,
    totalBudgetsBaseCents,
    totalBudgetsCarryOverCents,
    totalBudgetsCents,
    totalBudgetSpentCents,
    totalPourMoiAvecEnveloppesCents,
    totalProvisionCents: totalPourMoiAvecEnveloppesCents,
    resteAVivreCents: salaryCents - totalPourMoiCents,
    resteAVivreApresEnveloppesCents: salaryCents - totalPourMoiAvecEnveloppesCents,
    pendingCount,
    count: rows.length,
  };
}

export function totalsByAccount(state: AppState, ym: YM, precomputed?: MonthComputedInputs) {
  const rows = precomputed?.charges ?? chargesForMonth(state, ym);
  const budgets = precomputed?.budgets ?? budgetsForMonth(state, ym);
  const accounts = accountById(state.accounts);

  const byAccount = new Map<
    AccountId,
    { chargesTotalCents: number; chargesPaidCents: number; budgetsCents: number; budgetsBaseCents: number; budgetsCarryOverCents: number }
  >();
  for (const r of rows) {
    const key: AccountId = r.destination?.kind === 'account' ? r.destination.accountId : r.accountId;
    const prev = byAccount.get(key) ?? {
      chargesTotalCents: 0,
      chargesPaidCents: 0,
      budgetsCents: 0,
      budgetsBaseCents: 0,
      budgetsCarryOverCents: 0,
    };
    const mineCents = r.scope === 'commun' ? r.myShareCents : r.amountCents;
    prev.chargesTotalCents += mineCents;
    if (r.paid) prev.chargesPaidCents += mineCents;
    byAccount.set(key, prev);
  }

  for (const b of budgets) {
    const key: AccountId = b.accountId;
    const prev = byAccount.get(key) ?? {
      chargesTotalCents: 0,
      chargesPaidCents: 0,
      budgetsCents: 0,
      budgetsBaseCents: 0,
      budgetsCarryOverCents: 0,
    };
    prev.budgetsCents += b.myShareCents;
    prev.budgetsBaseCents += b.baseMyShareCents;
    prev.budgetsCarryOverCents += b.carryOverMyShareCents;
    byAccount.set(key, prev);
  }

  const orderedKnownIds = state.accounts.map((a) => a.id);
  const knownIdSet = new Set(orderedKnownIds);
  const unknownIds = Array.from(byAccount.keys())
    .filter((id) => !knownIdSet.has(id))
    .sort((a, b) => a.localeCompare(b));
  const order = [...orderedKnownIds, ...unknownIds];

  return order
    .map((id) => {
      const a = accounts.get(id);
      const t = byAccount.get(id) ?? {
        chargesTotalCents: 0,
        chargesPaidCents: 0,
        budgetsCents: 0,
        budgetsBaseCents: 0,
        budgetsCarryOverCents: 0,
      };
      return {
        accountId: id,
        accountName: a?.name ?? id,
        kind: a?.kind ?? 'perso',
        chargesTotalCents: t.chargesTotalCents,
        chargesPaidCents: t.chargesPaidCents,
        budgetsBaseCents: t.budgetsBaseCents,
        budgetsCarryOverCents: t.budgetsCarryOverCents,
        budgetsCents: t.budgetsCents,
        totalCents: t.chargesTotalCents + t.budgetsCents,
        isKnownAccount: Boolean(a),
      };
    })
    .filter((x) => x.chargesTotalCents !== 0 || x.budgetsBaseCents !== 0 || x.budgetsCarryOverCents !== 0 || x.budgetsCents !== 0);
}
