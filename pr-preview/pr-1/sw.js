/*
 * LarpCam service worker. Makes the app open with no connection.
 *
 * vite.config.ts fills in VERSION and PRECACHE at build time. Rules:
 *  - Every built file is cached on install and served cache-first.
 *  - Opening the app (a navigation to the scope root) gets the cached page.
 *  - Anything else is left to the network untouched.
 *  - A pull-request preview lives in a subfolder of the same site, so cache
 *    names carry the scope and this worker ignores URLs it did not build.
 */
const VERSION = "8d437654963a";
const PRECACHE = ["assets/analysis.worker-3S1F05Zt.js","assets/index-Bog5KTbA.css","assets/index-DxCyEjyh.js","assets/instrument-serif-latin-400-normal-DnYpCC2O.woff2","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/icon.svg","index.html","manifest.webmanifest"];

const scope = new URL(self.registration.scope);
const PREFIX = `larpcam:${scope.pathname}:`;
const CACHE = PREFIX + VERSION;
const known = new Set(PRECACHE.map((path) => new URL(path, scope).href));
const indexUrl = new URL('index.html', scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((path) => new Request(new URL(path, scope).href, { cache: 'reload' })));
      // First install has nothing to interrupt, so take over straight away.
      // Updates wait until the page asks (see src/lib/updates.ts).
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;
  url.hash = '';
  url.search = '';

  let key = null;
  if (known.has(url.href)) key = url.href;
  else if (request.mode === 'navigate' && url.href === scope.href) key = indexUrl;
  if (!key) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(key);
      return hit || fetch(request);
    })(),
  );
});
