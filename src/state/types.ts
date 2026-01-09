import type { YM } from '../lib/date';

export type AccountId = 'BS_PERSO' | 'CA_PERSO' | 'LCL_PERSO' | 'CC_CA' | 'CC_LCL' | 'BS_HIDAYA' | 'BS_IMANI';

export type Account = {
  id: AccountId;
  name: string;
  kind: 'perso' | 'commun';
  active: boolean;
};

export type ChargeScope = 'perso' | 'commun';
export type ChargePayment = 'auto' | 'manuel';

export type ChargeDestination =
  | { kind: 'account'; accountId: AccountId }
  | { kind: 'text'; text: string };

export type Charge = {
  id: string;
  name: string;
  amountCents: number;
  sortOrder: number;
  dayOfMonth: number;
  accountId: AccountId;
  scope: ChargeScope;
  splitPercent?: number; // commun only (default 50)
  payment: ChargePayment;
  destination?: ChargeDestination | null;
  active: boolean;
};

export type Budget = {
  id: string;
  name: string;
  amountCents: number;
  accountId: AccountId;
  active: boolean;
};

export type MonthChargeSnapshot = Pick<
  Charge,
  'name' | 'amountCents' | 'sortOrder' | 'dayOfMonth' | 'accountId' | 'scope' | 'splitPercent' | 'payment' | 'destination'
>;

export type MonthChargeState = {
  paid: boolean;
  snapshot?: MonthChargeSnapshot;
};

export type MonthBudgetSnapshot = Pick<Budget, 'name' | 'amountCents' | 'accountId'>;

export type BudgetExpense = {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  amountCents: number; // positive number = spending
};

export type MonthBudgetState = {
  expenses: BudgetExpense[];
  snapshot?: MonthBudgetSnapshot;
};

export type MonthData = {
  ym: YM;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  salaryCents?: number;
  charges: Record<string, MonthChargeState>;
  budgets: Record<string, MonthBudgetState>;
};

export type AppState = {
  version: 1;
  salaryCents: number;
  accounts: Account[];
  charges: Charge[];
  budgets: Budget[];
  months: Record<YM, MonthData>;
};
