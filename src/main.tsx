import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { kickDynamicBackground } from './lib/backgroundClient';

let swRegistration: ServiceWorkerRegistration | null = null;

function kickBackground(options?: { force?: boolean }) {
  void kickDynamicBackground(options);
}

function scheduleBackgroundWarmup() {
  const runner = () => kickBackground();
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => void };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(runner, { timeout: 1200 });
    return;
  }
  window.setTimeout(runner, 200);
}

function installOverflowDebug() {
  if (!import.meta.env.DEV) return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debugOverflow') !== '1') return;

    const style = document.createElement('style');
    style.textContent = `[data-overflow-x="1"]{outline:2px solid rgba(244,63,94,0.9)!important;outline-offset:2px!important;}`;
    document.head.appendChild(style);

    const mark = () => {
      const vw = document.documentElement.clientWidth;
      const offenders: Array<{ el: Element; overflowPx: number }> = [];

      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) continue;
        (el as HTMLElement).removeAttribute('data-overflow-x');
        const rect = el.getBoundingClientRect();
        const overflowPx = rect.right - vw;
        if (overflowPx > 0.5) offenders.push({ el, overflowPx });
      }

      offenders.sort((a, b) => b.overflowPx - a.overflowPx);
      for (const o of offenders.slice(0, 30)) {
        (o.el as HTMLElement).setAttribute('data-overflow-x', '1');
      }

      // eslint-disable-next-line no-console
      console.log(
        '[overflow-debug] top offenders:',
        offenders.slice(0, 12).map((o) => ({
          overflowPx: Math.round(o.overflowPx * 10) / 10,
          tag: o.el.tagName.toLowerCase(),
          class: (o.el as HTMLElement).className || '',
        })),
      );
    };

    (window as any).__debugOverflow = mark;
    window.addEventListener('resize', () => window.requestAnimationFrame(mark));
    window.addEventListener('load', () => window.requestAnimationFrame(mark));
    window.requestAnimationFrame(mark);
  } catch {
    // ignore
  }
}

scheduleBackgroundWarmup();
installOverflowDebug();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  kickBackground({ force: true });
  swRegistration?.update().catch(() => undefined);
});
window.addEventListener('pageshow', () => {
  kickBackground();
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
