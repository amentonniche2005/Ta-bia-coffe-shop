const CACHE_NAME = 'tabia-caisse-v13';
const FICHIERS_A_CACHER = [
    '/',
    '/caisse.html',
    '/comptoir.html',      
    '/admin-print.html',   
    '/comptoir.js',
    '/logo.jpg',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://cdn.socket.io/4.5.4/socket.io.min.js'
];

// 1. À l'installation, on télécharge les fichiers vitaux
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(FICHIERS_A_CACHER);
        })
    );
});

// 2. À chaque requête réseau (quand on actualise la page)
self.addEventListener('fetch', (event) => {
    // Si c'est une requête API (MongoDB), on laisse passer (on la gère dans caisse.html)
    if (event.request.url.includes('/api/')) return;

    // Pour le reste (HTML, images), on essaie le réseau, sinon on prend le cache
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});