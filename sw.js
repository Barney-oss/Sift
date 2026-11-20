// Sift service worker: makes Sift installable and readable offline.
// - The app files are served from cache instantly and refreshed in the background.
// - Today's edition is fetched fresh when online, and the last copy is shown when offline.
// Bump VERSION when you want every phone to drop the old cache.
const VERSION = 'sift-v4';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request) {
  return fetch(request)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
      }
      return res;
    })
    .catch(() => caches.match(request, { ignoreSearch: true }));
}

function staleWhileRevalidate(request) {
  return caches.open(VERSION).then((cache) =>
    cache.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fonts from Google: cache once, reuse forever.
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Pages and editions: always try for the newest, fall back to the saved copy offline.
  if (req.mode === 'navigate' || url.pathname.includes('/editions/')) {
    event.respondWith(networkFirst(req).then((res) => res || caches.match('./index.html')));
    return;
  }

  // App files and icons: instant from cache, refreshed in the background.
  event.respondWith(staleWhileRevalidate(req));
});
