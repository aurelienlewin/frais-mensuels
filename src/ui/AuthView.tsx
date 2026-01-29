import { useEffect, useMemo, useRef, useState } from 'react';
import { authLogin, authRegister, authResetPassword, type AuthUser } from '../lib/authApi';
import { passwordPolicy, passwordScore } from '../lib/passwordPolicy';
import { cx } from './cx';

type Mode = 'login' | 'register' | 'reset' | 'recovery';

export function AuthView({
  online,
  onAuthed,
}: {
  online: boolean;
  onAuthed: (user: AuthUser) => void;
}) {
  const tabOrder: Array<Extract<Mode, 'login' | 'register' | 'reset'>> = ['login', 'register', 'reset'];
  const tabRefs = useRef<Record<(typeof tabOrder)[number], HTMLButtonElement | null>>({
    login: null,
    register: null,
    reset: null,
  });
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [mode]);

  const policy = useMemo(() => passwordPolicy(email, mode === 'reset' ? password2 : password), [email, mode, password, password2]);
  const score = useMemo(() => passwordScore(email, mode === 'reset' ? password2 : password), [email, mode, password, password2]);

  const canSubmit = (() => {
    if (!online) return false;
    if (working) return false;
    if (!email.trim()) return false;
    if (mode === 'login') return password.length > 0;
    if (mode === 'register') return password.length > 0 && policy.ok;
    if (mode === 'reset') return recoveryCode.trim().length > 0 && password2.length > 0 && policy.ok;
    return false;
  })();

  const submit = async () => {
    if (!canSubmit) return;
    setWorking(true);
    setError(null);
    try {
      if (mode === 'login') {
        const user = await authLogin(email, password);
        onAuthed(user);
        return;
      }
      if (mode === 'register') {
        const { user, recoveryCode: rc } = await authRegister(email, password);
        setPendingUser(user);
        setRecoveryCode(rc);
        setRecoverySaved(false);
        setMode('recovery');
        return;
      }
      if (mode === 'reset') {
        const { user, recoveryCode: rc } = await authResetPassword(email, recoveryCode, password2);
        setPendingUser(user);
        setRecoveryCode(rc);
        setRecoverySaved(false);
        setMode('recovery');
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      setError(msg);
    } finally {
      setWorking(false);
    }
  };

  const activeTab: (typeof tabOrder)[number] = mode === 'register' || mode === 'reset' ? mode : 'login';
  const activeTabId = `auth-tab-${activeTab}`;

  const moveTab = (dir: 'prev' | 'next' | 'first' | 'last') => {
    const idx = tabOrder.indexOf(activeTab);
    if (idx < 0) return;
    const nextIdx =
      dir === 'first'
        ? 0
        : dir === 'last'
          ? tabOrder.length - 1
          : dir === 'prev'
            ? (idx + tabOrder.length - 1) % tabOrder.length
            : (idx + 1) % tabOrder.length;
    const next = tabOrder[nextIdx]!;
    setMode(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="min-h-dvh px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-sm font-semibold tracking-tight text-slate-200">Frais mensuels</div>
          <div className="mt-1 text-xs text-slate-400">Connexion pour accéder à tes données (comptes, charges, enveloppes).</div>
        </div>

        <div className="motion-pop overflow-hidden rounded-3xl border border-white/15 bg-ink-950/70 shadow-[0_20px_120px_-60px_rgba(0,0,0,0.9)]">
          <div className="border-b border-white/10 p-2">
            {mode !== 'recovery' ? (
              <div role="tablist" aria-label="Mode d’authentification" className="grid grid-cols-3 gap-2">
                <TabButton
                  id="auth-tab-login"
                  buttonRef={(el) => {
                    tabRefs.current.login = el;
                  }}
                  active={mode === 'login'}
                  label="Se connecter"
                  onSelect={() => setMode('login')}
                  onMove={moveTab}
                />
                <TabButton
                  id="auth-tab-register"
                  buttonRef={(el) => {
                    tabRefs.current.register = el;
                  }}
                  active={mode === 'register'}
                  label="Créer"
                  onSelect={() => setMode('register')}
                  onMove={moveTab}
                />
                <TabButton
                  id="auth-tab-reset"
                  buttonRef={(el) => {
                    tabRefs.current.reset = el;
                  }}
                  active={mode === 'reset'}
                  label="Reset"
                  onSelect={() => setMode('reset')}
                  onMove={moveTab}
                />
              </div>
            ) : (
              <div className="px-4 py-2 text-sm font-semibold text-slate-200" role="heading" aria-level={2}>
                Récupération
              </div>
            )}
          </div>

          <div
            id="auth-panel"
            role="tabpanel"
            aria-labelledby={mode !== 'recovery' ? activeTabId : undefined}
            aria-label={mode === 'recovery' ? 'Récupération du compte' : undefined}
            className="space-y-4 p-6"
          >
            {!online ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-2xl border border-rose-200/20 bg-rose-400/10 px-4 py-3 text-xs text-rose-100"
              >
                Offline: impossible de se connecter / créer un compte.
              </div>
            ) : null}

            {mode === 'recovery' && pendingUser ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-50">
                  Garde ce code en sécurité. Il sert à récupérer ton compte si tu perds ton mot de passe.
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recovery code</div>
                  <div className="mt-2 break-all rounded-2xl border border-white/10 bg-ink-950/35 p-3 font-mono text-[12px] text-slate-100">
                    {recoveryCode}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-white/15 bg-white/7 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(recoveryCode);
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      Copier
                    </button>
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={recoverySaved}
                        onChange={(e) => setRecoverySaved(e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-400"
                      />
                      J’ai sauvegardé
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  className={cx(
                    'w-full rounded-2xl border border-slate-200/25 bg-slate-400/12 px-5 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-400/18',
                    (!recoverySaved || working) && 'opacity-50 hover:bg-slate-400/12',
                  )}
                  disabled={!recoverySaved || working}
                  onClick={() => onAuthed(pendingUser)}
                >
                  Continuer
                </button>
              </div>
            ) : (
              <>
                <label className="grid gap-2">
                  <div className="text-xs text-slate-400">Email</div>
                  <input
                    className="h-11 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-slate-200/40 focus:bg-ink-950/45"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="toi@exemple.com"
                  />
                </label>

                {mode === 'login' ? (
                  <label className="grid gap-2">
                    <div className="text-xs text-slate-400">Mot de passe</div>
                    <input
                      className="h-11 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-slate-200/40 focus:bg-ink-950/45"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submit();
                      }}
                    />
                  </label>
                ) : null}

                {mode === 'register' ? (
                  <>
                    <label className="grid gap-2">
                      <div className="text-xs text-slate-400">Mot de passe</div>
                      <input
                        className="h-11 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-slate-200/40 focus:bg-ink-950/45"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submit();
                        }}
                      />
                    </label>
                    <PasswordStrength score={score} reasons={policy.reasons} />
                  </>
                ) : null}

                {mode === 'reset' ? (
                  <>
                    <label className="grid gap-2">
                      <div className="text-xs text-slate-400">Recovery code</div>
                      <input
                        className="h-11 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-4 font-mono text-[13px] text-slate-100 outline-none placeholder:text-slate-400 focus:border-slate-200/40 focus:bg-ink-950/45"
                        value={recoveryCode}
                        onChange={(e) => setRecoveryCode(e.target.value)}
                        placeholder="Colle ton code"
                      />
                    </label>
                    <label className="grid gap-2">
                      <div className="text-xs text-slate-400">Nouveau mot de passe</div>
                      <input
                        className="h-11 w-full rounded-2xl border border-white/15 bg-ink-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-slate-200/40 focus:bg-ink-950/45"
                        type="password"
                        autoComplete="new-password"
                        value={password2}
                        onChange={(e) => setPassword2(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submit();
                        }}
                      />
                    </label>
                    <PasswordStrength score={score} reasons={policy.reasons} />
                  </>
                ) : null}

                {error ? (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="rounded-2xl border border-rose-200/20 bg-rose-400/10 px-4 py-3 text-xs text-rose-100"
                  >
                    {error}
                  </div>
                ) : null}

                <button
                  type="button"
                  className={cx(
                    'w-full rounded-2xl border border-slate-200/25 bg-slate-400/12 px-5 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-400/18',
                    (!canSubmit || working) && 'opacity-50 hover:bg-slate-400/12',
                  )}
                  disabled={!canSubmit || working}
                  onClick={submit}
                >
                  {working ? '…' : mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer le compte' : 'Réinitialiser'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const TabButton = ({
  id,
  active,
  label,
  onSelect,
  onMove,
  buttonRef,
}: {
  id: string;
  active: boolean;
  label: string;
  onSelect: () => void;
  onMove: (dir: 'prev' | 'next' | 'first' | 'last') => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) => {
  return (
    <button
      id={id}
      ref={buttonRef}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls="auth-panel"
      tabIndex={active ? 0 : -1}
      className={cx(
        'rounded-2xl px-3 py-2 text-sm font-semibold transition-colors',
        active ? 'bg-white/12 text-slate-100' : 'bg-white/5 text-slate-300 hover:bg-white/8',
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onMove('prev');
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          onMove('next');
        }
        if (e.key === 'Home') {
          e.preventDefault();
          onMove('first');
        }
        if (e.key === 'End') {
          e.preventDefault();
          onMove('last');
        }
      }}
    >
      {label}
    </button>
  );
};

function PasswordStrength({ score, reasons }: { score: number; reasons: string[] }) {
  const label = score >= 4 ? 'Fort' : score >= 3 ? 'OK' : score >= 2 ? 'Faible' : 'Trop faible';
  const tone = score >= 3 ? 'text-emerald-200' : score >= 2 ? 'text-amber-200' : 'text-rose-200';
  const width = `${Math.round((Math.min(4, Math.max(0, score)) / 4) * 100)}%`;
  const barTone = score >= 3 ? 'bg-emerald-400/70' : score >= 2 ? 'bg-amber-400/70' : 'bg-rose-400/70';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between text-xs">
        <div className="text-slate-400">Qualité</div>
        <div className={cx('font-semibold', tone)}>{label}</div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className={cx('h-full rounded-full', barTone)} style={{ width }} />
      </div>
      {reasons.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[11px] text-slate-300">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 text-[11px] text-slate-400">OK</div>
      )}
    </div>
  );
}
