// Service worker pro PWA – hra funguje offline a jde nainstalovat.
// Cesty jsou relativní ke scope (umístění tohoto souboru).
const PREFIX = 'labyrinth-';
const CACHE = PREFIX + 'v3';

const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon.svg',
    './css/styles.css',
    './js/scripts.js',
    './js/game.js',
    './js/level.js',
    './js/audio.js',
    './js/haptics.js',
    './js/physics.js',
    './js/traps.js',
    './js/input.js',
    './js/draw.js',
    './js/theme.js',
    './js/themes/registry.js',
    './js/themes/default.js',
    './js/themes/cellar.js',
    './js/themes/kitchen.js',
    './js/themes/sewer.js',
    './js/entities/entity.js',
    './js/entities/runner.js',
    './js/entities/mouse.js',
    './js/entities/cat.js',
    './js/entities/saw.js',
    ...Array.from({length: 10}, (_, i) => `./js/levels/level${i + 1}.js`),
];

/**
 * Stažení mimo cache prohlížeče. Samotné `fetch(req)` totiž smí sáhnout do
 * HTTP cache a statické hostingy posílají `max-age`, takže by se čerstvě
 * nasazená verze objevila na telefonu klidně až za deset minut, přestože je
 * service worker network-first. `no-cache` si u serveru pokaždé ověří ETag.
 */
function fetchFresh(request) {
    return fetch(new Request(request, {cache: 'no-cache'}));
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

/**
 * Network-first: hra je malá a aktuálnost je důležitější než pár set
 * milisekund. Když síť není, odpoví cache – proto jde hrát i offline.
 */
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetchFresh(event.request)
            .then(response => {
                const copy = response.clone();
                caches.open(CACHE).then(cache => cache.put(event.request, copy));
                return response;
            })
            .catch(() => caches.match(event.request).then(hit => hit ?? caches.match('./index.html')))
    );
});
