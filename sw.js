// Service worker for the Leads Panel -- forces a real network fetch for the page itself
// on every load instead of trusting any cache (browser or CDN), so updates show up the
// moment they're pushed, on every device, with no manual refresh tricks ever needed.
// Falls back to the last-known copy only if there's genuinely no network connection.

const CACHE_NAME = 'dm-helper-offline-fallback-v3';

self.addEventListener('install', () => {
    self.skipWaiting(); // activate immediately, don't wait for old tabs to close
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(), // take control of already-open tabs right away
            // Drop any cache left behind by a previous version of this worker -- a stale
            // fallback cache is exactly what makes an old build look "stuck" forever.
            caches.keys().then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            )),
        ])
    );
});

self.addEventListener('fetch', (event) => {
    const isPageRequest = event.request.mode === 'navigate' || event.request.destination === 'document';

    if (isPageRequest) {
        // `cache: 'no-store'` only bypasses this browser's own HTTP cache -- it does nothing
        // about GitHub Pages' own CDN edge, which can still hand back a stale cached response
        // to an identical URL. Appending a unique query param makes every fetch a guaranteed
        // cache miss at the edge too, so this can never silently go stale again.
        const url = new URL(event.request.url);
        url.searchParams.set('_sw', Date.now().toString());
        event.respondWith(
            fetch(url.toString(), { cache: 'no-store' })
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
