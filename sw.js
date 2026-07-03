const CACHE_NAME = 'simple-gamez-v1.8.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './assets/brain_rot_merge_thumb.jpg',
  './assets/raising_comet_thumb.jpg',
  './assets/shift_surf_thumb.jpg',
  './assets/icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
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

// Fetch Event (Network First for manifest and HTML files, Cache First for other static assets)
self.addEventListener('fetch', event => {
  const isManifest = event.request.url.includes('manifest.json');
  const isNavigation = event.request.mode === 'navigate';

  if (isManifest || isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh response before returning it
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
        .catch(() => {
          // If network fails, serve from the offline cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache First strategy for images, scripts, styling, icons, and audio
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
