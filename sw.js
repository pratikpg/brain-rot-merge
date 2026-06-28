const CACHE_NAME = 'simple-gamez-v1.0.2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  // Meme sprites
  './assets/tralaleo.png',
  './assets/larele.png',
  './assets/capuchinna.png',
  './assets/sigma_boy.png',
  './assets/mewing_cat.png',
  './assets/the_rizzler.png',
  './assets/skibidi_blob.png',
  './assets/giga_chad_emoji.png',
  './assets/brain_rot_king.png',
  // Football sprites
  './assets/yamal.png',
  './assets/bellingham.png',
  './assets/haaland.png',
  './assets/mbappe.png',
  './assets/neymar.png',
  './assets/debruyne.png',
  './assets/ronaldo.png',
  './assets/messi.png',
  './assets/trophy.jpg'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Service Worker: Caching critical assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Cache First, fallback to Network)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});
