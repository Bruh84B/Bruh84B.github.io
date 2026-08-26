/* Пульт — service worker: cache-first, полный офлайн после первого открытия. */
const CACHE_VERSION = 'pult-v3';

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
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const runtimeHost = RUNTIME_HOSTS.indexOf(url.hostname) !== -1;
  if (!sameOrigin && !runtimeHost) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (cacheable(request, response)) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          /* офлайн и нет в кеше: для навигации отдаём оболочку приложения */
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return Response.error();
        });
    })
  );
});
