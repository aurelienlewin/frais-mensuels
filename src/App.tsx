import { StoreProvider } from './state/store';
import { AppView } from './ui/AppView';
import { AuthView } from './ui/AuthView';
import { authLogout, authMe, type AuthUser } from './lib/authApi';
import { ymFromDate } from './lib/date';
import { useEffect, useState } from 'react';

export default function App() {
  const initialYm = ymFromDate(new Date());
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [user, setUser] = useState<AuthUser | null>(null);
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
      try {
        const u = await authMe();
        if (cancelled) return;
        setUser(u);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Erreur';
        setBootError(msg);
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
        onLogout={async () => {
          try {
            await authLogout();
          } finally {
            setUser(null);
          }
        }}
      />
    </StoreProvider>
  );
}
