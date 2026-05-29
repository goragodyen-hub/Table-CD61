const CACHE_NAME = 'study-table-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './time-table.png',
  './manifest.json'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching all assets');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-while-revalidate strategy (High performance & robust fallback)
self.addEventListener('fetch', (e) => {
  // Only handle local GET requests
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // If found in cache, return cached response and fetch fresh in background
      if (cachedResponse) {
        fetch(e.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(e.request, networkResponse);
              });
            }
          })
          .catch((err) => console.log('[Service Worker] Background sync failed:', err.message));
          
        return cachedResponse;
      }
      
      // If not in cache, fetch from network directly (this naturally throws or rejects if offline, letting browser handle it)
      return fetch(e.request);
    })
  );
});
