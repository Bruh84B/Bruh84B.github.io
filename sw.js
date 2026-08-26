/* Пульт — service worker.
   Навигация: network-first (обновления видны сразу), офлайн — из кеша.
   Статика и шрифты: cache-first. */
const CACHE_VERSION = 'pult-v4';

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

/* Хосты, чьи ответы кешируем в runtime (Google Fonts: CSS + файлы шрифтов). */
const RUNTIME_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  /* не атомарно: временный сбой одной иконки не должен оставить приложение без офлайна */
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.allSettled(CORE_ASSETS.map((a) => cache.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function cacheable(request, response) {
  if (!response) return false;
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const runtimeHost = RUNTIME_HOSTS.indexOf(url.hostname) !== -1;
  if (!sameOrigin && !runtimeHost) return false;
  /* opaque — на случай no-cors запросов к шрифтам */
  return response.ok || response.type === 'opaque';
}

function fetchAndCache(request) {
  return fetch(request).then((response) => {
    if (cacheable(request, response)) {
      const copy = response.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
    }
    return response;
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const runtimeHost = RUNTIME_HOSTS.indexOf(url.hostname) !== -1;
  if (!sameOrigin && !runtimeHost) return;

  const isNavigation = request.mode === 'navigate' ||
    (sameOrigin && (url.pathname === '/' || url.pathname.endsWith('/index.html')));

  if (isNavigation) {
    /* network-first: свежая версия сразу, офлайн — из кеша */
    event.respondWith(
      fetchAndCache(request).catch(() =>
        caches.match(request).then((c) => c || caches.match('./index.html'))
      )
    );
    return;
  }

  /* статика: cache-first */
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetchAndCache(request).catch(() => Response.error());
    })
  );
});
