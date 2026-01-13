import { useMemo, useState } from 'react';
import { eurosToCents, parseEuroAmount } from '../lib/money';
import { useStoreState } from '../state/store';
import type { Account, Budget } from '../state/types';
import { cx } from './cx';

function normalizeId(raw: string) {
  return raw
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
}

function normalizeSearch(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findBudgetByKeywords(budgets: Budget[], keywords: string[]) {
  const active = budgets.filter((b) => b.active);
  const kws = keywords.map(normalizeSearch);
  return active.find((b) => kws.some((k) => normalizeSearch(b.name).includes(k))) ?? null;
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  ariaLabel: string;
}) {
  return (
    <select
      className="h-9 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-3 text-xs font-semibold text-slate-100 outline-none focus:border-white/25 focus:bg-ink-950/45"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function AccountsSetupPrompt() {
  const { state, dispatch } = useStoreState();
  const activeAccounts = useMemo(() => state.accounts.filter((a) => a.active), [state.accounts]);

  const [rawId, setRawId] = useState('');
  const [kind, setKind] = useState<Account['kind']>('perso');

  const normalizedId = normalizeId(rawId);
  const alreadyExists = Boolean(normalizedId && state.accounts.some((a) => a.id === normalizedId));

  const canSubmit = Boolean(normalizedId);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">À faire</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">Ajoute tes comptes (provenance / destination)</div>
      <div className="mt-2 text-xs text-slate-300">
        Ils servent dans les charges (provenance) et les virements (destination). Exemple: <span className="font-mono">PERSONAL_MAIN</span>,{' '}
        <span className="font-mono">JOINT_MAIN</span>.
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_120px]">
        <input
          className="h-9 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-fuchsia-200/40 focus:bg-ink-950/45"
          placeholder="ex: BOURSO_PERSO"
          value={rawId}
          onChange={(e) => setRawId(e.target.value)}
          aria-label="ID du compte"
        />
        <Select
          value={kind}
          onChange={(v) => setKind(v as Account['kind'])}
          options={[
            { value: 'perso', label: 'Perso' },
            { value: 'commun', label: 'Commun' },
          ]}
          ariaLabel="Type de compte"
        />
        <button
          type="button"
          className={cx(
            'h-9 rounded-2xl border border-fuchsia-200/25 bg-fuchsia-400/12 px-4 text-sm font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/18',
            !canSubmit && 'opacity-50 hover:bg-fuchsia-400/12',
          )}
          disabled={!canSubmit}
          onClick={() => {
            if (!normalizedId) return;
            dispatch({ type: 'ADD_ACCOUNT', accountId: normalizedId, kind });
            setRawId('');
          }}
        >
          {alreadyExists ? 'Restaurer' : 'Ajouter'}
        </button>
      </div>

      {activeAccounts.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="text-slate-400">Actifs:</span>
          {activeAccounts.map((a) => (
            <span key={a.id} className="rounded-full border border-white/10 bg-ink-950/35 px-2 py-1 font-mono text-[11px]">
              {a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 text-[11px] text-slate-400">Astuce: espaces → “_”, tout est mis en majuscules.</div>
    </div>
  );
}

function BudgetSetupCard({
  title,
  keywords,
  defaultName,
}: {
  title: string;
  keywords: string[];
  defaultName: string;
}) {
  const { state, dispatch } = useStoreState();
  const activeAccounts = useMemo(() => state.accounts.filter((a) => a.active), [state.accounts]);
  const defaultAccountId = activeAccounts.find((a) => a.kind === 'perso')?.id ?? activeAccounts[0]?.id ?? '';

  const existing = findBudgetByKeywords(state.budgets, keywords);

  const [name, setName] = useState(existing?.name ?? defaultName);
  const [amount, setAmount] = useState<string>(() => {
    const cents = existing?.amountCents ?? 0;
    return cents ? String(cents / 100) : '';
  });
  const [accountId, setAccountId] = useState(existing?.accountId ?? defaultAccountId);

  const canSubmit = (() => {
    if (!name.trim()) return false;
    if (!accountId) return false;
    const euros = amount.trim() === '' ? 0 : parseEuroAmount(amount);
    if (euros === null || euros < 0) return false;
    return true;
  })();

  const status =
    existing?.active
      ? `Déjà détectée: ${existing.name}`
      : existing
        ? `Trouvée (inactive): ${existing.name}`
        : 'À créer';

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-950/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{status}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px]">
        <input
          className="h-9 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-fuchsia-200/40 focus:bg-ink-950/45"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={`Nom enveloppe: ${title}`}
        />
	        <div className="relative">
	          <input
	            className="h-9 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-3 pr-10 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-fuchsia-200/40 focus:bg-ink-950/45"
	            placeholder="0"
	            inputMode="decimal"
	            type="text"
	            value={amount}
	            onChange={(e) => setAmount(e.target.value)}
	            aria-label={`Montant enveloppe (euros): ${title}`}
	          />
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">€</div>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px]">
        <Select
          value={accountId}
          onChange={setAccountId}
          options={activeAccounts.map((a) => ({ value: a.id, label: a.name && a.name !== a.id ? `${a.name} (${a.id})` : a.id }))}
          ariaLabel={`Compte source enveloppe: ${title}`}
        />
        <button
          type="button"
          className={cx(
            'h-9 rounded-2xl border border-fuchsia-200/25 bg-fuchsia-400/12 px-4 text-sm font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/18',
            !canSubmit && 'opacity-50 hover:bg-fuchsia-400/12',
          )}
	          disabled={!canSubmit}
	          onClick={() => {
	            const cleanName = name.trim();
	            if (!cleanName || !accountId) return;
	            const euros = amount.trim() === '' ? 0 : parseEuroAmount(amount);
	            if (euros === null || euros < 0) return;
	            const amountCents = eurosToCents(euros);

	            if (existing) {
	              dispatch({
	                type: 'UPDATE_BUDGET',
	                budgetId: existing.id,
	                patch: { name: cleanName, amountCents, accountId, scope: 'perso', active: true },
	              });
	              return;
	            }
	            dispatch({ type: 'ADD_BUDGET', budget: { name: cleanName, amountCents, accountId, scope: 'perso', active: true } });
	          }}
	        >
          {existing ? 'Mettre à jour' : 'Créer'}
        </button>
      </div>
    </div>
  );
}

export function EssentialBudgetsSetupPrompt() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">À faire</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">Crée 2 enveloppes: perso + essence</div>
      <div className="mt-2 text-xs text-slate-300">
        Le widget d’ajout rapide détecte automatiquement les enveloppes si leur nom contient <span className="font-mono">perso</span> et{' '}
        <span className="font-mono">essence</span>.
      </div>

      <div className="mt-3 grid gap-3">
        <BudgetSetupCard title="Enveloppe perso" keywords={['budget perso', 'perso']} defaultName="Budget perso" />
        <BudgetSetupCard title="Enveloppe essence" keywords={['essence', 'carbur']} defaultName="Essence" />
      </div>
    </div>
  );
}
