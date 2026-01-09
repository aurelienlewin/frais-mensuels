/* Frais mensuels - Service Worker (cache runtime) */
const CACHE_NAME = 'fraismensuels-v2';
const CORE_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/bg-snowy.jpg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // SPA navigation: network-first, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const copy = res.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', copy);
          return res;
        } catch {
          const cached = await caches.match('/index.html');
          return cached || new Response('Offline', { status: 503 });
        }
      })(),
    );
    return;
  }

  const isAsset = ['script', 'style', 'image', 'font'].includes(req.destination);

  if (isAsset) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        const copy = res.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, copy);
        return res;
      })(),
    );
    return;
  }

  // Default: network-first
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        const copy = res.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, copy);
        return res;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response('Offline', { status: 503 });
      }
    })(),
  );
});
