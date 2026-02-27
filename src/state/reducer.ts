import { dueDateIso, pad2 } from '../lib/date';
import { uid } from '../lib/id';
import type { Account, AppState, Budget, BudgetExpense, Charge, MonthChargeSnapshot, MonthData } from './types';

export type Action =
  | { type: 'HYDRATE'; state: AppState }
  | { type: 'SET_SALARY'; ym: MonthData['ym']; salaryCents: number }
  | { type: 'SET_UI'; patch: NonNullable<AppState['ui']> }
  | { type: 'ADD_ACCOUNT'; accountId: Account['id']; kind: Account['kind'] }
  | { type: 'UPDATE_ACCOUNT'; accountId: Account['id']; patch: Partial<Omit<Account, 'id'>> }
  | { type: 'REMOVE_ACCOUNT'; accountId: Account['id']; moveToAccountId: Account['id'] }
  | { type: 'ENSURE_MONTH'; ym: MonthData['ym'] }
  | { type: 'TOGGLE_CHARGE_PAID'; ym: MonthData['ym']; chargeId: string; paid: boolean }
  | { type: 'SET_CHARGES_PAID'; ym: MonthData['ym']; chargeIds: string[]; paid: boolean }
  | { type: 'HIDE_CHARGE_FOR_MONTH'; ym: MonthData['ym']; chargeId: string }
  | { type: 'ADD_MONTH_CHARGE'; ym: MonthData['ym']; charge: Omit<Charge, 'id' | 'sortOrder' | 'active'> }
  | { type: 'UPDATE_MONTH_CHARGE'; ym: MonthData['ym']; chargeId: string; patch: Partial<Omit<Charge, 'id' | 'active'>> }
  | { type: 'REMOVE_MONTH_CHARGE'; ym: MonthData['ym']; chargeId: string }
  | { type: 'ARCHIVE_MONTH'; ym: MonthData['ym'] }
  | { type: 'UNARCHIVE_MONTH'; ym: MonthData['ym'] }
  | { type: 'SET_BUDGET_CARRY_HANDLED'; ym: MonthData['ym']; budgetId: string; handled: boolean }
  | { type: 'SET_BUDGET_CARRY_FORWARD_HANDLED'; ym: MonthData['ym']; budgetId: string; handled: boolean }
  | { type: 'ADD_BUDGET_EXPENSE'; ym: MonthData['ym']; budgetId: string; expense: Omit<BudgetExpense, 'id'> }
  | { type: 'UPDATE_BUDGET_EXPENSE'; ym: MonthData['ym']; budgetId: string; expenseId: string; patch: Partial<Omit<BudgetExpense, 'id'>> }
  | { type: 'REMOVE_BUDGET_EXPENSE'; ym: MonthData['ym']; budgetId: string; expenseId: string }
  | { type: 'ADD_BUDGET'; budget: Omit<Budget, 'id'> }
  | { type: 'UPDATE_BUDGET'; budgetId: string; patch: Partial<Omit<Budget, 'id'>> }
  | { type: 'REMOVE_BUDGET'; ym: MonthData['ym']; budgetId: string }
  | { type: 'ADD_CHARGE'; charge: Omit<Charge, 'id' | 'sortOrder'> }
  | { type: 'UPDATE_CHARGE'; chargeId: string; patch: Partial<Omit<Charge, 'id'>> }
  | { type: 'REORDER_CHARGES'; scope: Charge['scope']; orderedIds: string[] }
  | { type: 'REMOVE_CHARGE'; chargeId: string };

function nowIso() {
  return new Date().toISOString();
}

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function ensureMonth(state: AppState, ym: MonthData['ym']): MonthData {
  const existing = state.months[ym];
  if (existing) return existing;
  return {
    ym,
    archived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    charges: {},
    budgets: {},
  };
}

function nextMonthChargeSortOrder(state: AppState, month: MonthData, scope: Charge['scope']): number {
  let maxGlobal = 0;
  for (const c of state.charges) {
    if (c.scope !== scope) continue;
    if (c.sortOrder > maxGlobal) maxGlobal = c.sortOrder;
  }

  let maxLocal = 0;
  for (const st of Object.values(month.charges)) {
    const snap = st.snapshot;
    if (!snap || snap.scope !== scope) continue;
    if (snap.sortOrder > maxLocal) maxLocal = snap.sortOrder;
  }

  return Math.max(maxGlobal, maxLocal) + 10;
}

function withMonth(state: AppState, ym: MonthData['ym'], updater: (m: MonthData) => MonthData): AppState {
  const m0 = ensureMonth(state, ym);
  const m1 = updater(m0);
  return {
    ...state,
    months: {
      ...state.months,
      [ym]: { ...m1, updatedAt: nowIso() },
    },
  };
}

export function reducer(state: AppState, action: Action): AppState {
  const next = (() => {
    switch (action.type) {
      case 'HYDRATE':
        return action.state;
      case 'SET_SALARY':
        return (() => {
          const ym = action.ym;
          const nextSalary = action.salaryCents;
          const prevSalary = state.salaryCents;
          const now = nowIso();
          let monthsChanged = false;

          const nextMonths = { ...state.months };
          for (const [key, month] of Object.entries(state.months)) {
            if (key >= ym) continue;
            if (typeof month.salaryCents === 'number') continue;
            nextMonths[key as keyof typeof nextMonths] = { ...month, salaryCents: prevSalary, updatedAt: now };
            monthsChanged = true;
          }

          const current = nextMonths[ym] ?? ensureMonth(state, ym);
          if (current.salaryCents !== nextSalary || !nextMonths[ym]) {
            nextMonths[ym] = { ...current, salaryCents: nextSalary, updatedAt: now };
            monthsChanged = true;
          }

          return {
            ...state,
            salaryCents: nextSalary,
            months: monthsChanged ? nextMonths : state.months,
          };
        })();
      case 'SET_UI':
        return { ...state, ui: { ...state.ui, ...action.patch } };
      case 'ADD_ACCOUNT': {
        const id = action.accountId;
        const kind = action.kind;
        if (!id) return state;

        const existing = state.accounts.find((a) => a.id === id) ?? null;
        if (existing) {
          // Idempotent: re-adding restores (and updates kind).
          return {
            ...state,
            accounts: state.accounts.map((a) => (a.id === id ? { ...a, active: true, kind } : a)),
          };
        }

        return {
          ...state,
          accounts: [...state.accounts, { id, name: id, kind, active: true }],
        };
      }
      case 'UPDATE_ACCOUNT':
        return {
          ...state,
          accounts: state.accounts.map((a) => (a.id === action.accountId ? { ...a, ...action.patch } : a)),
        };
      case 'REMOVE_ACCOUNT': {
        const accountId = action.accountId;
        const moveToId = action.moveToAccountId;
        if (accountId === moveToId) return state;

        const src = state.accounts.find((a) => a.id === accountId) ?? null;
        const dst = state.accounts.find((a) => a.id === moveToId) ?? null;
        if (!src || !dst) return state;
        if (!dst.active) return state;

        const activeCount = state.accounts.filter((a) => a.active).length;
        if (src.active && activeCount <= 1) return state;

        const fallbackText = src.id;

        return {
          ...state,
          accounts: state.accounts.map((a) => (a.id === accountId ? { ...a, active: false } : a)),
          charges: state.charges.map((c) => {
            let next: Charge = c;
            if (c.accountId === accountId) next = { ...next, accountId: moveToId };
            if (c.destination?.kind === 'account' && c.destination.accountId === accountId) {
              next = { ...next, destination: { kind: 'text', text: fallbackText } };
            }
            return next;
          }),
          budgets: state.budgets.map((b) => (b.accountId === accountId ? { ...b, accountId: moveToId } : b)),
        };
      }
      case 'ENSURE_MONTH': {
        const month = ensureMonth(state, action.ym);
        if (state.months[action.ym]) return state;
        return { ...state, months: { ...state.months, [action.ym]: month } };
      }
      case 'TOGGLE_CHARGE_PAID':
        return withMonth(state, action.ym, (m) => ({
          ...m,
          charges: {
            ...m.charges,
            [action.chargeId]: {
              paid: action.paid,
              snapshot: m.charges[action.chargeId]?.snapshot,
              removed: m.charges[action.chargeId]?.removed,
            },
          },
        }));
      case 'SET_CHARGES_PAID':
        return withMonth(state, action.ym, (m) => {
          if (m.archived) return m;
          const nextCharges = { ...m.charges };
          let changed = false;
          for (const chargeId of action.chargeIds) {
            const prev = m.charges[chargeId];
            const prevPaid = prev?.paid ?? false;
            if (prevPaid === action.paid) continue;
            nextCharges[chargeId] = { paid: action.paid, snapshot: prev?.snapshot, removed: prev?.removed };
            changed = true;
          }
          if (!changed) return m;
          return { ...m, charges: nextCharges };
        });
      case 'HIDE_CHARGE_FOR_MONTH':
        return withMonth(state, action.ym, (m) => {
          if (m.archived) return m;
          const existing = m.charges[action.chargeId];
          if (existing?.removed) return m;
          return {
            ...m,
            charges: {
              ...m.charges,
              [action.chargeId]: {
                paid: existing?.paid ?? false,
                snapshot: existing?.snapshot,
                removed: true,
              },
            },
          };
        });
      case 'ADD_MONTH_CHARGE':
        return withMonth(state, action.ym, (m) => {
          if (m.archived) return m;
          const id = uid('mchg');
          const sortOrder = nextMonthChargeSortOrder(state, m, action.charge.scope);
          const splitPercent = action.charge.scope === 'commun' ? 50 : undefined;
          return {
            ...m,
            charges: {
              ...m.charges,
              [id]: {
                paid: false,
                snapshot: {
                  name: action.charge.name,
                  amountCents: action.charge.amountCents,
                  sortOrder,
                  dayOfMonth: action.charge.dayOfMonth,
                  accountId: action.charge.accountId,
                  scope: action.charge.scope,
                  splitPercent,
                  payment: action.charge.payment,
                  destination: action.charge.destination ?? null,
                },
              },
            },
          };
        });
      case 'UPDATE_MONTH_CHARGE':
        return withMonth(state, action.ym, (m) => {
          if (m.archived) return m;
          const st = m.charges[action.chargeId];
          const snap = st?.snapshot;
          if (!st || !snap) return m;
          // Only month-only charges are editable via this action.
          const existsGlobally = state.charges.some((c) => c.id === action.chargeId);
          if (existsGlobally) return m;

          const nextSnap = (() => {
            const merged = { ...snap, ...action.patch } as MonthChargeSnapshot;
            const nextScope: MonthChargeSnapshot['scope'] = merged.scope === 'commun' ? 'commun' : 'perso';
            return { ...merged, scope: nextScope, splitPercent: nextScope === 'commun' ? 50 : undefined } as MonthChargeSnapshot;
          })();

          return {
            ...m,
            charges: {
              ...m.charges,
              [action.chargeId]: { ...st, snapshot: nextSnap },
            },
          };
        });
      case 'REMOVE_MONTH_CHARGE':
        return withMonth(state, action.ym, (m) => {
          if (m.archived) return m;
          const st = m.charges[action.chargeId];
          if (!st?.snapshot) return m;
          const existsGlobally = state.charges.some((c) => c.id === action.chargeId);
          if (existsGlobally) return m;
          const nextCharges = { ...m.charges };
          delete nextCharges[action.chargeId];
          return { ...m, charges: nextCharges };
        });
	      case 'ARCHIVE_MONTH':
	        return withMonth(state, action.ym, (m) => {
          const today = todayIsoLocal();
          const chargesWithSnapshots = { ...m.charges };
	          for (const ch of state.charges) {
	            if (!ch.active) continue;
              if (chargesWithSnapshots[ch.id]?.removed) continue;
	            const current = chargesWithSnapshots[ch.id];
	            if (current?.snapshot) continue;
	            chargesWithSnapshots[ch.id] = {
	              paid: current?.paid ?? (ch.payment === 'auto' && dueDateIso(action.ym, ch.dayOfMonth) <= today),
	              snapshot: {
	                name: ch.name,
	                amountCents: ch.amountCents,
	                sortOrder: ch.sortOrder,
	                dayOfMonth: ch.dayOfMonth,
	                accountId: ch.accountId,
	                scope: ch.scope,
	                splitPercent: ch.scope === 'commun' ? (ch.splitPercent ?? 50) : undefined,
	                payment: ch.payment,
	                destination: ch.destination,
	              },
	            };
	          }
	          const budgetsWithSnapshots = { ...m.budgets };
	          for (const b of state.budgets) {
	            if (!b.active) continue;
	            const current = budgetsWithSnapshots[b.id];
	            if (current?.snapshot) continue;
	            budgetsWithSnapshots[b.id] = {
	              expenses: current?.expenses ?? [],
                carryOverHandled: current?.carryOverHandled,
                carryForwardHandled: current?.carryForwardHandled,
	              snapshot: {
	                name: b.name,
	                amountCents: b.amountCents,
	                accountId: b.accountId,
	                scope: b.scope,
	                splitPercent: b.scope === 'commun' ? (b.splitPercent ?? 50) : undefined,
	              },
	            };
	          }
	          return { ...m, archived: true, charges: chargesWithSnapshots, budgets: budgetsWithSnapshots };
	        });
      case 'UNARCHIVE_MONTH':
        return withMonth(state, action.ym, (m) => ({ ...m, archived: false }));
      case 'SET_BUDGET_CARRY_HANDLED':
        return withMonth(state, action.ym, (m) => {
          if (m.archived) return m;
          const existing = m.budgets[action.budgetId];
          if (existing?.carryOverHandled === action.handled) return m;

          // Keep the month budget state if it contains data (expenses/snapshot), otherwise clean it up.
          if (!action.handled && existing && (existing.expenses?.length ?? 0) === 0 && !existing.snapshot && !existing.carryForwardHandled) {
            const nextBudgets = { ...m.budgets };
            delete nextBudgets[action.budgetId];
            return { ...m, budgets: nextBudgets };
          }

          return {
            ...m,
            budgets: {
              ...m.budgets,
              [action.budgetId]: {
                expenses: existing?.expenses ?? [],
                snapshot: existing?.snapshot,
                carryOverHandled: action.handled,
                carryForwardHandled: existing?.carryForwardHandled,
              },
            },
          };
        });
      case 'SET_BUDGET_CARRY_FORWARD_HANDLED':
        return withMonth(state, action.ym, (m) => {
          if (m.archived) return m;
          const existing = m.budgets[action.budgetId];
          if (existing?.carryForwardHandled === action.handled) return m;

          // Keep the month budget state if it contains data (expenses/snapshot), otherwise clean it up.
          if (!action.handled && existing && (existing.expenses?.length ?? 0) === 0 && !existing.snapshot && !existing.carryOverHandled) {
            const nextBudgets = { ...m.budgets };
            delete nextBudgets[action.budgetId];
            return { ...m, budgets: nextBudgets };
          }

          return {
            ...m,
            budgets: {
              ...m.budgets,
              [action.budgetId]: {
                expenses: existing?.expenses ?? [],
                snapshot: existing?.snapshot,
                carryOverHandled: existing?.carryOverHandled,
                carryForwardHandled: action.handled,
              },
            },
          };
        });
      case 'ADD_BUDGET_EXPENSE':
        return withMonth(state, action.ym, (m) => {
          const existing = m.budgets[action.budgetId];
          const prev = existing?.expenses ?? [];
          const next: BudgetExpense = { ...action.expense, id: uid('exp') };
          return {
            ...m,
            budgets: {
              ...m.budgets,
              [action.budgetId]: {
                expenses: [next, ...prev],
                snapshot: existing?.snapshot,
                carryOverHandled: existing?.carryOverHandled,
                carryForwardHandled: existing?.carryForwardHandled,
              },
            },
          };
        });
      case 'UPDATE_BUDGET_EXPENSE':
        return withMonth(state, action.ym, (m) => {
          const existing = m.budgets[action.budgetId];
          const prev = existing?.expenses ?? [];
          if (!existing || prev.length === 0) return m;

          const nextExpenses = prev.map((e) => {
            if (e.id !== action.expenseId) return e;
            const patch = action.patch;
            const nextAmountCents =
              typeof patch.amountCents === 'number' && Number.isFinite(patch.amountCents) ? Math.max(0, Math.round(patch.amountCents)) : e.amountCents;
            return {
              ...e,
              ...patch,
              date: typeof patch.date === 'string' ? patch.date : e.date,
              label: typeof patch.label === 'string' ? patch.label : e.label,
              amountCents: nextAmountCents,
            };
          });

          return {
            ...m,
            budgets: {
              ...m.budgets,
              [action.budgetId]: {
                expenses: nextExpenses,
                snapshot: existing.snapshot,
                carryOverHandled: existing.carryOverHandled,
                carryForwardHandled: existing.carryForwardHandled,
              },
            },
          };
        });
      case 'REMOVE_BUDGET_EXPENSE':
        return withMonth(state, action.ym, (m) => {
          const existing = m.budgets[action.budgetId];
          const prev = existing?.expenses ?? [];
          return {
            ...m,
            budgets: {
              ...m.budgets,
              [action.budgetId]: {
                expenses: prev.filter((e) => e.id !== action.expenseId),
                snapshot: existing?.snapshot,
                carryOverHandled: existing?.carryOverHandled,
                carryForwardHandled: existing?.carryForwardHandled,
              },
            },
          };
        });
	      case 'ADD_BUDGET':
	        return (() => {
	          const scope: Budget['scope'] = action.budget.scope === 'commun' ? 'commun' : 'perso';
	          const next: Budget = {
	            ...action.budget,
	            id: uid('bud'),
	            scope,
	            splitPercent: scope === 'commun' ? (action.budget.splitPercent ?? 50) : undefined,
	          };
	          return { ...state, budgets: [...state.budgets, next] };
	        })();
	      case 'UPDATE_BUDGET':
	        return {
	          ...state,
	          budgets: state.budgets.map((b) => {
	            if (b.id !== action.budgetId) return b;
	            const merged = { ...b, ...action.patch } as Budget;
	            const scope: Budget['scope'] = merged.scope === 'commun' ? 'commun' : 'perso';
	            const splitPercent =
	              scope === 'commun'
	                ? typeof merged.splitPercent === 'number' && Number.isFinite(merged.splitPercent)
	                  ? Math.max(0, Math.min(100, Math.round(merged.splitPercent)))
	                  : 50
	                : undefined;
	            return { ...merged, scope, splitPercent };
	          }),
	        };
      case 'REMOVE_BUDGET':
        return {
          ...state,
          budgets: state.budgets.map((b) => (b.id === action.budgetId ? { ...b, active: false, inactiveFromYm: action.ym } : b)),
        };
      case 'ADD_CHARGE':
        return {
          ...state,
          charges: [
            ...state.charges,
            {
              ...action.charge,
              id: uid('chg'),
              sortOrder:
                state.charges
                  .filter((c) => c.scope === action.charge.scope)
                  .reduce((max, c) => Math.max(max, c.sortOrder), 0) + 10,
            },
          ],
        };
      case 'UPDATE_CHARGE': {
        const current = state.charges.find((c) => c.id === action.chargeId);
        const patch = (() => {
          if (!current) return action.patch;
          const nextScope = action.patch.scope;
          const scopeChanged = typeof nextScope === 'string' && nextScope !== current.scope;
          const hasOrder = typeof action.patch.sortOrder === 'number';
          if (!scopeChanged || hasOrder) return action.patch;
          const max = state.charges
            .filter((c) => c.scope === nextScope && c.id !== current.id)
            .reduce((acc, c) => Math.max(acc, c.sortOrder), 0);
          return { ...action.patch, sortOrder: max + 10 };
        })();
        return {
          ...state,
          charges: state.charges.map((c) => (c.id === action.chargeId ? { ...c, ...patch } : c)),
        };
      }
      case 'REORDER_CHARGES': {
        const scope = action.scope;
        const ordered = action.orderedIds;
        const existingIds = new Set(state.charges.filter((c) => c.scope === scope).map((c) => c.id));
        const wanted = ordered.filter((id) => existingIds.has(id));
        const wantedSet = new Set(wanted);
        const remaining = state.charges
          .filter((c) => c.scope === scope && !wantedSet.has(c.id))
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => c.id);
        const full = [...wanted, ...remaining];
        const orderById = new Map<string, number>();
        full.forEach((id, idx) => orderById.set(id, (idx + 1) * 10));
        return {
          ...state,
          charges: state.charges.map((c) => (c.scope === scope ? { ...c, sortOrder: orderById.get(c.id) ?? c.sortOrder } : c)),
        };
      }
      case 'REMOVE_CHARGE':
        return {
          ...state,
          charges: state.charges.map((c) => (c.id === action.chargeId ? { ...c, active: false } : c)),
        };
      default:
        return state;
    }
  })();

  if (action.type === 'HYDRATE') return next;
  if (next === state) return state;
  return { ...next, modifiedAt: nowIso() };
}
