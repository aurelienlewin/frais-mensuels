import { dueDateIso, pad2 } from '../lib/date';
import { uid } from '../lib/id';
import type { Account, AppState, Budget, BudgetExpense, Charge, MonthData } from './types';

export type Action =
  | { type: 'HYDRATE'; state: AppState }
  | { type: 'SET_SALARY'; salaryCents: number }
  | { type: 'UPDATE_ACCOUNT'; accountId: Account['id']; patch: Partial<Omit<Account, 'id'>> }
  | { type: 'REMOVE_ACCOUNT'; accountId: Account['id']; moveToAccountId: Account['id'] }
  | { type: 'ENSURE_MONTH'; ym: MonthData['ym'] }
  | { type: 'TOGGLE_CHARGE_PAID'; ym: MonthData['ym']; chargeId: string; paid: boolean }
  | { type: 'ARCHIVE_MONTH'; ym: MonthData['ym'] }
  | { type: 'UNARCHIVE_MONTH'; ym: MonthData['ym'] }
  | { type: 'ADD_BUDGET_EXPENSE'; ym: MonthData['ym']; budgetId: string; expense: Omit<BudgetExpense, 'id'> }
  | { type: 'REMOVE_BUDGET_EXPENSE'; ym: MonthData['ym']; budgetId: string; expenseId: string }
  | { type: 'ADD_BUDGET'; budget: Omit<Budget, 'id'> }
  | { type: 'UPDATE_BUDGET'; budgetId: string; patch: Partial<Omit<Budget, 'id'>> }
  | { type: 'REMOVE_BUDGET'; budgetId: string }
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
        return { ...state, salaryCents: action.salaryCents };
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
            },
          },
        }));
      case 'ARCHIVE_MONTH':
        return withMonth(state, action.ym, (m) => {
          const today = todayIsoLocal();
          const chargesWithSnapshots = { ...m.charges };
          for (const ch of state.charges) {
            if (!ch.active) continue;
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
                splitPercent: ch.scope === 'commun' ? 50 : undefined,
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
              snapshot: { name: b.name, amountCents: b.amountCents, accountId: b.accountId },
            };
          }
          return { ...m, archived: true, charges: chargesWithSnapshots, budgets: budgetsWithSnapshots };
        });
      case 'UNARCHIVE_MONTH':
        return withMonth(state, action.ym, (m) => ({ ...m, archived: false }));
      case 'ADD_BUDGET_EXPENSE':
        return withMonth(state, action.ym, (m) => {
          const existing = m.budgets[action.budgetId];
          const prev = existing?.expenses ?? [];
          const next: BudgetExpense = { ...action.expense, id: uid('exp') };
          return {
            ...m,
            budgets: {
              ...m.budgets,
              [action.budgetId]: { expenses: [next, ...prev], snapshot: existing?.snapshot },
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
              [action.budgetId]: { expenses: prev.filter((e) => e.id !== action.expenseId), snapshot: existing?.snapshot },
            },
          };
        });
      case 'ADD_BUDGET':
        return { ...state, budgets: [...state.budgets, { ...action.budget, id: uid('bud') }] };
      case 'UPDATE_BUDGET':
        return {
          ...state,
          budgets: state.budgets.map((b) => (b.id === action.budgetId ? { ...b, ...action.patch } : b)),
        };
      case 'REMOVE_BUDGET':
        return {
          ...state,
          budgets: state.budgets.map((b) => (b.id === action.budgetId ? { ...b, active: false } : b)),
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
        const remaining = state.charges
          .filter((c) => c.scope === scope && !wanted.includes(c.id))
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
