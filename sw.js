// Service Worker for offline support
const CACHE_NAME = 'muscu-v10';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './db.js',
    './data.js',
    './app.js',
    './manifest.json',
    './icons/icon-192.png.svg',
    './icons/icon-512.png.svg'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - network-first for index.html, cache-first for others
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Network-first strategy for index.html to get updates quickly
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('/')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Cache the new version
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if offline
                    return caches.match(event.request);
                })
        );
        return;
    }
    
    // Cache-first for all other assets
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then((fetchResponse) => {
                    // Don't cache non-GET requests or external resources
                    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
                        return fetchResponse;
                    }
                    // Cache the fetched resource
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            })
            .catch(() => {
                // Offline fallback
                return caches.match('./index.html');
            })
    );
});
