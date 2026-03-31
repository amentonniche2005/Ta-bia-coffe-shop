const CACHE_NAME = 'tabia-cache-v2'; // On passe à v2
const urlsToCache = [
  '/',
  '/index.html', // 👈 Ta page client (change le nom si c'est différent)
  '/script-client.js',
  '/manifest-client.json',
  '/caisse.html',
  '/gestion-stock.html',
  '/caisse-login.html',
  '/manifest.json'
];

// Installation du Service Worker et mise en cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Récupération des données (Mode hors-ligne)
self.addEventListener('fetch', event => {
  // On ignore les requêtes vers les API (pour avoir des données fraîches)
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});