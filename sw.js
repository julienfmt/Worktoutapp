// Service Worker for offline support
const SW_VERSION = '2026-04-23-2';
const STATIC_CACHE_NAME = `muscu-static-${SW_VERSION}`;
const RUNTIME_CACHE_NAME = `muscu-runtime-${SW_VERSION}`;
const OFFLINE_DOCUMENT = './index.html';
const APP_SHELL_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './streak-score.css',
    './db.js',
    './data.js',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

function isCacheableRequest(request) {
    return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

function isNavigationRequest(request) {
    return request.mode === 'navigate' ||
        request.headers.get('accept')?.includes('text/html');
}

async function addAppShellToCache() {
    const cache = await caches.open(STATIC_CACHE_NAME);

    await Promise.all(APP_SHELL_ASSETS.map(async (asset) => {
        try {
            await cache.add(asset);
        } catch (error) {
            console.warn('[SW] Impossible de mettre en cache:', asset, error);
        }
    }));
}

async function putInRuntimeCache(request, response) {
    if (!isCacheableRequest(request) || !response || !response.ok) {
        return response;
    }

    const cache = await caches.open(RUNTIME_CACHE_NAME);
    await cache.put(request, response.clone());
    return response;
}

async function handleNavigation(event) {
    const preloadResponse = await event.preloadResponse;
    if (preloadResponse) {
        return putInRuntimeCache(event.request, preloadResponse);
    }

    try {
        const networkResponse = await fetch(event.request);
        return await putInRuntimeCache(event.request, networkResponse);
    } catch (error) {
        return (await caches.match(event.request)) || (await caches.match(OFFLINE_DOCUMENT));
    }
}

async function handleAsset(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        fetch(request)
            .then((response) => putInRuntimeCache(request, response))
            .catch(() => {});
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        return await putInRuntimeCache(request, networkResponse);
    } catch (error) {
        return new Response('', {
            status: 503,
            statusText: 'Offline'
        });
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        addAppShellToCache()
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('[SW] Installation échouée:', error);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheKeys = await caches.keys();
        const validKeys = new Set([STATIC_CACHE_NAME, RUNTIME_CACHE_NAME]);

        await Promise.all(
            cacheKeys
                .filter((key) => !validKeys.has(key))
                .map((key) => caches.delete(key))
        );

        if ('navigationPreload' in self.registration) {
            try {
                await self.registration.navigationPreload.enable();
            } catch (error) {
                console.warn('[SW] Navigation preload indisponible:', error);
            }
        }

        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    if (!isCacheableRequest(event.request)) {
        return;
    }

    if (isNavigationRequest(event.request)) {
        event.respondWith(handleNavigation(event));
        return;
    }

    event.respondWith(handleAsset(event.request));
});
