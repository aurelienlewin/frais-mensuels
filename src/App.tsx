import { StoreProvider } from './state/store';
import { AppView } from './ui/AppView';
import { AuthView } from './ui/AuthView';
import { authLogout, authMe, type AuthUser } from './lib/authApi';
import { ymFromDate } from './lib/date';
import { useEffect, useState } from 'react';
import { clearCachedUser, readCachedUser, writeCachedUser } from './lib/authCache';

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
      <>
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
      </>
    );
  }

  return (
    <StoreProvider storageKey={user.id}>
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
    </StoreProvider>
  );
}
