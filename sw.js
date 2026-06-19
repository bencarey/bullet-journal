/* Bullet Journal service worker — offline app shell. Bump CACHE on releases. */
const CACHE = 'bujo-shell-v1';
const ASSETS = [
  './',
  './journal.html',
  './manifest.json',
  './config.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache the data API — journal content must hit the network when online.
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return;
  if (e.request.method !== 'GET') return;
  // Cache-first for the app shell, fall back to the cached page when offline.
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match('./journal.html')))
  );
});
