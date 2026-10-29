// Service Worker for offline support
const SW_VERSION = '6.4.0';
const STATIC_CACHE_NAME = `muscu-static-${SW_VERSION}`;
const RUNTIME_CACHE_NAME = `muscu-runtime-${SW_VERSION}`;
// Exercise thumbnails/GIFs are fetched on demand from the dataset repo and
// kept across versions, capped so storage stays small.
const MEDIA_CACHE_NAME = 'muscu-exercise-media';
const MEDIA_CACHE_LIMIT = 120;
const MEDIA_HOST = 'raw.githubusercontent.com';
const OFFLINE_DOCUMENT = './index.html';
const APP_SHELL_ASSETS = [
    './',
    './index.html',
    './styles.css?v=6.4.0',
    './streak-score.css?v=6.4.0',
    './theme.css?v=6.4.0',
    './ai-coach.css?v=6.4.0',
    './onboarding.css?v=6.4.0',
    './v6.css?v=6.4.0',
    './dark.css?v=6.4.0',
    './db.js?v=6.4.0',
    './exercises-db.json?v=2',
    './data.js?v=6.4.0',
    './exercise-db.js?v=6.4.0',
    './exo-profile.js?v=6.4.0',
    './app.js?v=6.4.0',
    './shell.js?v=6.4.0',
    './journey.js?v=6.4.0',
    './cardio.js?v=6.4.0',
    './onboarding.js?v=6.4.0',
    './swap.js?v=6.4.0',
    './engage.js?v=6.4.0',
    './premium.js?v=6.4.0',
    './rhino-notifications.js?v=6.4.0',
    './native.js?v=6.4.0',
    './tools.js?v=6.4.0',
    './league.js?v=6.4.0',
    './social.js?v=6.4.0',
    './ai-coach.js?v=6.4.0',
    './ai-coach-ui.js?v=6.4.0',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png',
    './icons/muscles/pectoraux.png',
    './icons/muscles/dos.png',
    './icons/muscles/epaules.png',
    './icons/muscles/biceps.png',
    './icons/muscles/triceps.png',
    './icons/muscles/avant-bras.png',
    './icons/muscles/quadriceps.png',
    './icons/muscles/ischio-jambiers.png',
    './icons/muscles/fessiers.png',
    './icons/muscles/mollets.png',
    './icons/muscles/abdominaux.png',
    './icons/muscles/lombaires.png',
    './icons/muscles/trapezes.png',
    './icons/muscles/coiffe.png',
    './icons/buddies/haltere.webp',
    './icons/buddies/shake-rate.webp',
    './icons/buddies/corde.webp',
    './icons/buddies/serviette.webp',
    './icons/buddies/shake-choco.webp',
    './icons/buddies/selfie.webp',
    './icons/buddies/mini-haltere.webp',
    './icons/buddies/pouces.webp',
    './icons/buddies/flex.webp'
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
            await cache.add(new Request(asset, { cache: 'reload' }));
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
    // Cache-first for instant launch; refresh in the background for next time.
    const cached = (await caches.match(event.request)) || (await caches.match(OFFLINE_DOCUMENT));
    const refresh = (async () => {
        const preloadResponse = await event.preloadResponse;
        const response = preloadResponse || await fetch(event.request);
        return putInRuntimeCache(event.request, response);
    })();
    if (cached) {
        event.waitUntil(refresh.catch(() => {}));
        return cached;
    }
    try {
        return await refresh;
    } catch (error) {
        return new Response('', { status: 503, statusText: 'Offline' });
    }
}

function isVersionedAsset(request) {
    return new URL(request.url).searchParams.has('v');
}

async function handleAsset(request) {
    const cachedResponse = await caches.match(request);
    // Versioned files never change: serve from cache with zero network work.
    if (cachedResponse && isVersionedAsset(request)) return cachedResponse;
    if (cachedResponse) {
        fetch(request, { cache: 'no-cache' })
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
        const validKeys = new Set([STATIC_CACHE_NAME, RUNTIME_CACHE_NAME, MEDIA_CACHE_NAME, 'muscu-fonts']);

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

function isExerciseMediaRequest(request) {
    if (request.method !== 'GET') return false;
    const url = new URL(request.url);
    return url.hostname === MEDIA_HOST && url.pathname.includes('/exercises-dataset/');
}

async function handleExerciseMedia(request) {
    const cache = await caches.open(MEDIA_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        if (keys.length > MEDIA_CACHE_LIMIT) {
            await Promise.all(keys.slice(0, keys.length - MEDIA_CACHE_LIMIT).map(key => cache.delete(key)));
        }
    }
    return response;
}

const FONT_CACHE_NAME = 'muscu-fonts';
function isFontRequest(request) {
    if (request.method !== 'GET') return false;
    const host = new URL(request.url).hostname;
    return host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com';
}

async function handleFont(request) {
    const cache = await caches.open(FONT_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
        await cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener('fetch', (event) => {
    if (isFontRequest(event.request)) {
        event.respondWith(handleFont(event.request).catch(() => new Response('', { status: 503 })));
        return;
    }
    if (isExerciseMediaRequest(event.request)) {
        event.respondWith(handleExerciseMedia(event.request).catch(() => new Response('', { status: 503 })));
        return;
    }

    if (!isCacheableRequest(event.request)) {
        return;
    }

    if (isNavigationRequest(event.request)) {
        event.respondWith(handleNavigation(event));
        return;
    }

    event.respondWith(handleAsset(event.request));
});

const REST_NOTIFICATION_STALE_MS = 20000;
let scheduledRestNotification = null;
let restNotificationSequence = 0;

function cancelScheduledRestNotification() {
    restNotificationSequence += 1;
    if (!scheduledRestNotification) return;

    clearTimeout(scheduledRestNotification.timeoutId);
    scheduledRestNotification.resolve();
    scheduledRestNotification = null;
}

function scheduleRestNotification(data = {}) {
    cancelScheduledRestNotification();

    const endTime = Number(data.endTime);
    if (!Number.isFinite(endTime)) return Promise.resolve();

    const sequence = ++restNotificationSequence;
    let resolveSchedule;
    const scheduledPromise = new Promise(resolve => {
        resolveSchedule = resolve;
        const timeoutId = setTimeout(async () => {
            if (sequence !== restNotificationSequence) {
                resolve();
                return;
            }

            scheduledRestNotification = null;
            try {
                // iOS (and Android in deep sleep) freezes the worker while the
                // app is in the background, so this timeout may only run when
                // the user reopens the app. A late "rest is over" alert is noise:
                // the app already shows GO on screen.
                if (Date.now() - endTime > REST_NOTIFICATION_STALE_MS) return;

                const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                if (windowClients.some(client => client.visibilityState === 'visible')) return;

                await self.registration.showNotification(String(data.title || 'Repos terminé'), {
                    body: String(data.body || 'Tu peux lancer la prochaine série.'),
                    tag: String(data.tag || 'muscu-rest-timer'),
                    renotify: false,
                    icon: './icons/icon-192.png',
                    badge: './icons/icon-192.png',
                    vibrate: [200, 100, 200],
                    requireInteraction: false,
                    data: { type: 'rest-timer', endTime }
                });

                windowClients.forEach(client => client.postMessage({ type: 'REST_TIMER_NOTIFICATION_SHOWN' }));
            } catch (error) {
                console.warn('[SW] Notification de repos indisponible:', error);
            } finally {
                resolve();
            }
        }, Math.max(0, Math.min(2147483647, endTime - Date.now())));

        scheduledRestNotification = {
            timeoutId,
            resolve: resolveSchedule
        };
    });

    return scheduledPromise;
}

self.addEventListener('message', (event) => {
    const type = event.data?.type;
    if (type === 'CANCEL_REST_TIMER_NOTIFICATION') {
        cancelScheduledRestNotification();
        return;
    }

    if (type === 'SCHEDULE_REST_TIMER_NOTIFICATION') {
        const task = scheduleRestNotification(event.data);
        if (typeof event.waitUntil === 'function') {
            event.waitUntil(task);
        }
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil((async () => {
        const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existingClient = windowClients.find(client => 'focus' in client);
        if (existingClient) {
            await existingClient.focus();
            return;
        }
        if (self.clients.openWindow) {
            await self.clients.openWindow('./');
        }
    })());
});
