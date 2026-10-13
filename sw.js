const CACHE = 'prioris-v5';
const ASSETS = [
  './', './index.html', './config.js', './manifest.json', './icon-192.png', './icon-512.png',
  './css/app.css', './js/app.js', './js/store.js', './js/parse.js', './js/dictation.js',
  './js/dates.js', './js/ui.js', './js/sheets.js',
  './js/views/home.js', './js/views/inbox.js', './js/views/tasks.js', './js/views/ideas.js', './js/views/login.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
