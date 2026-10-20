// Version : à augmenter à chaque déploiement qui change l'application. La page la lit pour proposer
// « Nouvelle version disponible » (js/update.js) ; elle sert aussi à purger les anciens caches.
const CACHE = 'prioris-v14';
const ASSETS = [
  './', './index.html', './config.js', './manifest.json', './icon-192.png', './icon-512.png',
  './css/app.css', './js/app.js', './js/store.js', './js/parse.js', './js/dictation.js',
  './js/dates.js', './js/ui.js', './js/sheets.js', './js/update.js',
  './js/views/home.js', './js/views/inbox.js', './js/views/tasks.js', './js/views/ideas.js', './js/views/login.js',
  './js/views/requests.js', './js/views/week.js',
];

// Réseau d'abord ; la copie locale ne sert qu'hors connexion ou quand le réseau tarde trop
const REPONSE_MAX_MS = 5000;

self.addEventListener('install', e => {
  // Un fichier introuvable ne doit pas empêcher l'installation (sinon l'ancienne version reste en place)
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

function depuisLeReseau(request) {
  return fetch(request, { cache: 'no-store' }).then(res => {
    if (res.ok) {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(request, clone));
    }
    return res;
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const reseau = depuisLeReseau(e.request);
    reseau.catch(() => {});   // évite une erreur « non gérée » si on a déjà répondu avec la copie
    const delai = new Promise(resolve => setTimeout(() => resolve(null), REPONSE_MAX_MS));
    try {
      const res = await Promise.race([reseau, delai]);
      if (res) return res;
      return (await caches.match(e.request)) || reseau;   // sans copie, on attend le réseau
    } catch (err) {
      const copie = await caches.match(e.request);
      if (copie) return copie;
      throw err;
    }
  })());
});
