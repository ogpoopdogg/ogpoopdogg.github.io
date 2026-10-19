// Service worker for the E&C staff tools home page and its sign-in page.
// Jobs:
//  1. Always open the newest version: each of the files below is downloaded fresh on every
//     open (skipping the browser's own saved copy), so an update shows up without clearing
//     anything or refreshing. The last downloaded copy is used only when there is no signal.
//  2. When update.js checks an open page (its requests carry ?ec-check) and a fresh download
//     differs from the copy saved last time, tell the page so update.js can reload it onto
//     the new version. A page that is just opening is already the newest, so it isn't told.
// Only these files are handled. Everything else on app.eandccourier.ca (the other apps and
// their own service workers) is left alone.
// Bumping CACHE_NAME also deletes the old cache.
const CACHE_NAME = 'ec-staff-tools-v1';
const SITE_FILES = [
    '/',
    '/index.html',
    '/auth.js',
    '/firebase-config.js',
    '/update.js',
    '/icon-512.png',
    '/login/',
    '/login/index.html'
];

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(key => key.startsWith('ec-staff-tools-') && key !== CACHE_NAME).map(key => caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

// Saves a fresh download and, when notify is set, tells the open pages if it differs from
// the last saved copy.
function save(cacheKey, response, notify) {
    return caches.open(CACHE_NAME).then(cache =>
        cache.match(cacheKey).then(saved => {
            const isText = !/^image\//.test(response.headers.get('Content-Type') || '');
            const changed = saved && isText
                ? Promise.all([saved.text(), response.clone().text()]).then(([a, b]) => a !== b)
                : Promise.resolve(false);
            return changed.then(isNew => cache.put(cacheKey, response).then(() => {
                if (!isNew || !notify) return;
                return self.clients.matchAll({ type: 'window' })
                    .then(clients => clients.forEach(client => client.postMessage({ type: 'ec-site-updated' })));
            }));
        })
    );
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || !SITE_FILES.includes(url.pathname)) return;

    // Saved under the address without any ?query part, so there is one copy of each file.
    const cacheKey = url.origin + url.pathname;
    event.respondWith(
        fetch(request, { cache: 'no-cache' })
            .then(response => {
                if (response && response.ok && !response.redirected) {
                    event.waitUntil(save(cacheKey, response.clone(), url.searchParams.has('ec-check')).catch(() => {}));
                }
                return response;
            })
            .catch(() => caches.match(cacheKey).then(hit => hit || Response.error()))
    );
});
