import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { initDynamicBackground } from './lib/background';

let swRegistration: ServiceWorkerRegistration | null = null;

initDynamicBackground();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  initDynamicBackground();
  swRegistration?.update().catch(() => undefined);
});
window.addEventListener('pageshow', () => {
  initDynamicBackground();
  swRegistration?.update().catch(() => undefined);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (!import.meta.env.PROD) return;
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;

    const reloadOnce = () => {
      if (!hadController) return;
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        swRegistration = reg;
        const requestActivation = () => {
          const worker = reg.waiting;
          if (!worker) return;
          try {
            worker.postMessage({ type: 'SKIP_WAITING' });
          } catch {
            // ignore
          }
        };

        // Trigger an update check ASAP.
        reg.update().catch(() => undefined);

        if (reg.waiting) requestActivation();

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state !== 'installed') return;
            if (!navigator.serviceWorker.controller) return; // first install
            try {
              installing.postMessage({ type: 'SKIP_WAITING' });
            } catch {
              // ignore
            }
          });
        });

        // Best-effort cache purge (we don't do offline cache, but this cleans leftovers).
        navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHES' });
      })
      .catch(() => undefined);
  });
}
