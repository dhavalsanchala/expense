/* Expense Tracker service worker
 * Strategy: network-first for the app shell (HTML/CSS/JS) so deploys are
 * picked up immediately when online; cache-first for static assets (icons);
 * cache fallback when offline.
 *
 * IMPORTANT: bump CACHE_VERSION on every deploy that changes shell files.
 * Format: expense-tracker-shell-YYYYMMDD-N
 */
const CACHE_VERSION = 'expense-tracker-shell-20260601-8';

// Shell files = the app code itself. Network-first.
const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js'
];

// Static files = rarely change. Cache-first.
const STATIC_FILES = [
  './manifest.json',
  './expense-icon.svg',
  './expense-icon-192.png',
  './expense-icon-512.png',
  './expense-icon-maskable-512.png'
];

const PRECACHE = [...SHELL_FILES, ...STATIC_FILES];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
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
      .then(() => self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
      }))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Cross-origin (fonts, etc.) — cache with network fallback
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  const pathname = url.pathname.toLowerCase();
  const isShell =
    pathname.endsWith('.html') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.json') ||
    pathname.endsWith('/') ||
    pathname === '' ||
    event.request.mode === 'navigate';

  if (isShell) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('./index.html');
        }))
    );
    return;
  }

  // Same-origin static — cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return res;
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
