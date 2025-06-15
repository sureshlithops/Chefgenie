const CACHE_NAME = 'chefgenie-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/static/recipes.json', // ensure correct path
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event: Cache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate event: Clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
             .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch event: Serve from cache or fetch from network
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Avoid caching POST requests like /process
  if (req.method === 'POST') return;

  e.respondWith(
    caches.match(req)
      .then(cached => {
        if (cached) return cached;

        return fetch(req).then(networkRes => {
          return caches.open(CACHE_NAME).then(cache => {
            // Only cache GET requests from same origin (not API or CDN)
            if (req.url.startsWith(self.location.origin)) {
              cache.put(req, networkRes.clone());
            }
            return networkRes;
          });
        });
      }).catch(() => {
        // Fallback for document navigation
        if (req.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});
