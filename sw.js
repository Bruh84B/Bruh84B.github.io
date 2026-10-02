/* Пульт — service worker.
   Навигация: сеть с таймаутом 2 с, иначе мгновенно кеш (полусеть на площадке — типовой случай).
   Статика: cache-first. Шрифты живут в отдельном кеше, который не сбрасывается релизами. */
const CORE_CACHE = 'pult-core-v17';
const RUNTIME_CACHE = 'pult-runtime';
const NAV_TIMEOUT = 2000;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  /* не атомарно: временный сбой одной иконки не должен оставить приложение без офлайна */
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => Promise.allSettled(CORE_ASSETS.map((a) => cache.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.indexOf('pult-core-') === 0 && k !== CORE_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function cacheFor(url) {
  return RUNTIME_HOSTS.indexOf(url.hostname) !== -1 ? RUNTIME_CACHE : CORE_CACHE;
}
function cacheable(request, response) {
  if (!response || request.method !== 'GET') return false;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && RUNTIME_HOSTS.indexOf(url.hostname) === -1) return false;
  return response.ok || response.type === 'opaque';
}
function fetchAndCache(request) {
  return fetch(request).then((response) => {
    if (cacheable(request, response)) {
      const copy = response.clone();
      caches.open(cacheFor(new URL(request.url))).then((c) => c.put(request, copy));
    }
    return response;
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && RUNTIME_HOSTS.indexOf(url.hostname) === -1) return;

  const isNavigation = request.mode === 'navigate' ||
    (sameOrigin && (url.pathname === '/' || url.pathname.endsWith('/index.html')));

  if (isNavigation) {
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const done = (r) => { if (!settled && r) { settled = true; resolve(r); } };
        const timer = setTimeout(() => {
          caches.match('./index.html').then((c) => { if (c) done(c); });
        }, NAV_TIMEOUT);
        fetchAndCache(request).then((r) => { clearTimeout(timer); done(r); })
          .catch(() => {
            clearTimeout(timer);
            caches.match(request)
              .then((c) => c || caches.match('./index.html'))
              .then((c) => done(c || Response.error()));
          });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetchAndCache(request).catch(() => Response.error()))
  );
});
