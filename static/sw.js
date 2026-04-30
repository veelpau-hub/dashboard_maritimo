// Service Worker for Dashboard Marítimo — Offline-first for static assets
const CACHE_NAME = 'dashboard-maritimo-v1';
const STATIC_ASSETS = [
    '/',
    '/static/style.css',
    '/static/js/main.js',
    '/static/js/dashboard.js',
    '/static/js/mapa.js',
    '/static/js/widgets.js',
    '/static/js/geo.js',
];

// Install: pre-cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS).catch(() => {});
        })
    );
    self.skipWaiting();
});

// Activate: clear old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for static assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip external resources (Mapbox, CDNs)
    if (!url.origin.includes(self.location.hostname)) return;

    // API calls: network-first with cache fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Cache successful API responses for offline use
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request).then(cached => {
                        if (cached) return cached;
                        return new Response(JSON.stringify({error: 'offline', offline: true}),
                            {headers: {'Content-Type': 'application/json'}});
                    });
                })
        );
        return;
    }

    // Static assets: cache-first
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
