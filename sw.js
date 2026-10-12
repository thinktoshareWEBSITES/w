// Service worker for the Leads Panel -- forces a real network fetch for the page itself
// on every load instead of trusting any cache (browser or CDN), so updates show up the
// moment they're pushed, on every device, with no manual refresh tricks ever needed.
// Falls back to the last-known copy only if there's genuinely no network connection.

const CACHE_NAME = 'dm-helper-offline-fallback';

self.addEventListener('install', () => {
    self.skipWaiting(); // activate immediately, don't wait for old tabs to close
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim()); // take control of already-open tabs right away
});

self.addEventListener('fetch', (event) => {
    const isPageRequest = event.request.mode === 'navigate' || event.request.destination === 'document';

    if (isPageRequest) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' })
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Non-page assets (fonts, etc.) -- normal fetch, cached copy only as an offline fallback
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
