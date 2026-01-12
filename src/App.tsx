import { Suspense, lazy, useEffect, useState } from 'react';
import { StoreProvider } from './state/store';
import { authLogout, authMe, type AuthUser } from './lib/authApi';
import { ymFromDate } from './lib/date';
import { clearCachedUser, readCachedUser, writeCachedUser } from './lib/authCache';

const AuthView = lazy(() => import('./ui/AuthView'));
const AppView = lazy(() => import('./ui/AppView'));

export default function App() {
  const initialYm = ymFromDate(new Date());
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionUnverified, setSessionUnverified] = useState(false);
  const [boot, setBoot] = useState<'loading' | 'ready'>('loading');
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = readCachedUser();
      try {
        const u = await authMe();
        if (cancelled) return;
        setUser(u);
        setSessionUnverified(false);
        if (u) writeCachedUser(u);
        else clearCachedUser();
      } catch (e) {
        if (cancelled) return;
        if (cached) {
          setUser(cached);
          setSessionUnverified(true);
        } else {
          const msg = e instanceof Error ? e.message : 'Erreur';
          setBootError(msg);
        }
      } finally {
        if (!cancelled) setBoot('ready');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (boot !== 'ready') {
    return (
      <div className="min-h-dvh px-6 py-10 text-center text-sm text-slate-300">
        Chargement…
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense
        fallback={
          <div className="min-h-dvh px-6 py-10 text-center text-sm text-slate-300">
            Chargement de l’interface…
          </div>
        }
      >
        {bootError ? (
          <div className="mx-auto max-w-md px-4 pt-6 text-center text-xs text-rose-200">
            {bootError}
          </div>
        ) : null}
        <AuthView
          online={online}
          onAuthed={(u) => {
            setBootError(null);
            setUser(u);
            setSessionUnverified(false);
            writeCachedUser(u);
          }}
        />
      </Suspense>
    );
  }

  return (
    <StoreProvider storageKey={user.id}>
      <Suspense
        fallback={
          <div className="min-h-dvh px-6 py-10 text-center text-sm text-slate-300">
            Chargement de l’interface…
          </div>
        }
      >
        <AppView
          initialYm={initialYm}
          user={user}
          sessionUnverified={sessionUnverified}
          onLogout={async () => {
            try {
              await authLogout();
            } finally {
              clearCachedUser();
              setUser(null);
              setSessionUnverified(false);
            }
          }}
        />
      </Suspense>
    </StoreProvider>
  );
}
