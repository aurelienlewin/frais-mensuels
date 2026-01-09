/* Frais mensuels - Service Worker (no offline cache) */

// We keep a SW mainly for "installability" in some browsers, but we don't implement offline caching.
// On activation we remove older caches left by previous versions.
const CACHE_PREFIX = 'fraismensuels-';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k)));
      } catch {
        // ignore
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
