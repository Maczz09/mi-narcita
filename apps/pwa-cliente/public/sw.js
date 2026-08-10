const CACHE_NAME = 'restoapp-pos-v5';
const ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  globalThis.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  globalThis.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // T-27: solo gestionamos GET del MISMO origen del SW. Las llamadas a la API van
  // por /v1/{servicio}/... (y antes /api): no deben cachearse nunca, ni siquiera si
  // PWA y gateway comparten dominio detrás de un reverse proxy.
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  const esApi =
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/v1/') ||
    url.pathname.startsWith('/api') ||
    url.pathname.includes('socket.io');
  if (esApi) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Guardar dinámicamente recursos estáticos
        if (response?.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      });
    })
  );
});
