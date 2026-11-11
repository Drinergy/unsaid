/**
 * This service worker used to cache pages and API answers for offline use. That cache only grew
 * (every map pan added another entry) and could serve stale data, so offline caching is gone.
 *
 * Browsers that still run the old worker pick this file up on their next visit: it deletes every
 * cache and removes itself, and nothing registers a worker any more.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
    })()
  );
});
