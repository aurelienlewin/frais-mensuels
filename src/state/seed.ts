import { ymFromDate } from '../lib/date';
import { eurosToCents } from '../lib/money';
import { uid } from '../lib/id';
import type { Account, AppState, Budget, Charge } from './types';

export function seedState(now = new Date()): AppState {
  const nowIso = now.toISOString();
  const accounts: Account[] = [
    { id: 'PERSONAL_MAIN', name: 'PERSONAL_MAIN', kind: 'perso', active: true },
    { id: 'PERSONAL_SAVINGS', name: 'PERSONAL_SAVINGS', kind: 'perso', active: true },
    { id: 'JOINT_MAIN', name: 'JOINT_MAIN', kind: 'commun', active: true },
  ];

  const charges: Charge[] = [
    {
      id: uid('chg'),
      name: 'Loyer',
      amountCents: eurosToCents(1200),
      sortOrder: 10,
      dayOfMonth: 5,
      accountId: 'JOINT_MAIN',
      scope: 'commun',
      splitPercent: 50,
      payment: 'auto',
      active: true,
    },
    {
      id: uid('chg'),
      name: 'Électricité',
      amountCents: eurosToCents(110),
      sortOrder: 20,
      dayOfMonth: 10,
      accountId: 'JOINT_MAIN',
      scope: 'commun',
      splitPercent: 50,
      payment: 'auto',
      active: true,
    },
    {
      id: uid('chg'),
      name: 'Internet',
      amountCents: eurosToCents(35.99),
      sortOrder: 30,
      dayOfMonth: 12,
      accountId: 'JOINT_MAIN',
      scope: 'commun',
      splitPercent: 50,
      payment: 'auto',
      active: true,
    },
    {
      id: uid('chg'),
      name: 'Assurance habitation',
      amountCents: eurosToCents(24.9),
      sortOrder: 40,
      dayOfMonth: 15,
      accountId: 'JOINT_MAIN',
      scope: 'commun',
      splitPercent: 50,
      payment: 'auto',
      active: true,
    },
    {
      id: uid('chg'),
      name: 'Courses',
      amountCents: eurosToCents(450),
      sortOrder: 50,
      dayOfMonth: 28,
      accountId: 'JOINT_MAIN',
      scope: 'commun',
      splitPercent: 50,
      payment: 'manuel',
      active: true,
    },
    {
      id: uid('chg'),
      name: 'Virement épargne',
      amountCents: eurosToCents(100),
      sortOrder: 10,
      dayOfMonth: 1,
      accountId: 'PERSONAL_MAIN',
      scope: 'perso',
      payment: 'auto',
      destination: { kind: 'account', accountId: 'PERSONAL_SAVINGS' },
      active: true,
    },
    {
      id: uid('chg'),
      name: 'Téléphone',
      amountCents: eurosToCents(19.99),
      sortOrder: 30,
      dayOfMonth: 5,
      accountId: 'PERSONAL_MAIN',
      scope: 'perso',
      payment: 'auto',
      active: true,
    },
    {
      id: uid('chg'),
      name: 'Mutuelle',
      amountCents: eurosToCents(60),
      sortOrder: 40,
      dayOfMonth: 7,
      accountId: 'PERSONAL_MAIN',
      scope: 'perso',
      payment: 'auto',
      active: true,
    },
    {
      id: uid('chg'),
      name: 'Transport',
      amountCents: eurosToCents(75),
      sortOrder: 20,
      dayOfMonth: 2,
      accountId: 'PERSONAL_MAIN',
      scope: 'perso',
      payment: 'auto',
      active: true,
    },
    {
      id: uid('chg'),
      name: 'Remboursement',
      amountCents: eurosToCents(120),
      sortOrder: 50,
      dayOfMonth: 15,
      accountId: 'PERSONAL_MAIN',
      scope: 'perso',
      payment: 'manuel',
      active: true,
    },
  ];

  const budgets: Budget[] = [
    {
      id: uid('bud'),
      name: 'Budget perso',
      amountCents: eurosToCents(200),
      accountId: 'PERSONAL_MAIN',
      active: true,
    },
    {
      id: uid('bud'),
      name: 'Essence',
      amountCents: eurosToCents(120),
      accountId: 'PERSONAL_MAIN',
      active: true,
    },
  ];

  const ym = ymFromDate(now);

  return {
    version: 1,
    modifiedAt: nowIso,
    salaryCents: eurosToCents(3000),
    accounts,
    charges,
    budgets,
    ui: { tourDismissed: false },
    months: {
      [ym]: {
        ym,
        archived: false,
        createdAt: nowIso,
        updatedAt: nowIso,
        charges: {},
        budgets: {},
      },
    },
  };
}
