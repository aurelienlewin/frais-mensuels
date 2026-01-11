/* Frais mensuels - Service Worker (no offline cache) */

// We keep a SW mainly for "installability" in some browsers, but we don't implement offline caching.
// On activation we remove Cache Storage entries and we bypass HTTP cache for navigations
// so a new deploy is picked up quickly in an installed PWA.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

async function clearAllCaches() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // ignore
  }
}

function fetchNoStore(req) {
  try {
    return fetch(new Request(req, { cache: 'no-store' }));
  } catch {
    return fetch(req);
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await clearAllCaches();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isAsset = url.pathname.startsWith('/assets/');
  const accept = req.headers.get('accept') || '';
  const isHtml = req.mode === 'navigate' || accept.includes('text/html');

  // Force fresh HTML (navigation) so the app picks up the latest deployment.
  if (isHtml) {
    event.respondWith(fetchNoStore(req));
    return;
  }

  // We do not implement offline cache; still, avoid stale responses for non-hashed files.
  if (!isAsset) {
    event.respondWith(fetchNoStore(req));
  }
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event?.data?.type === 'CLEAR_CACHES') {
    event.waitUntil(clearAllCaches());
  }
});
