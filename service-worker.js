// Pizza PRO — Service Worker
// Strategia: Cache First per risorse statiche, Network First per tutto il resto

const CACHE_NAME = 'pizza-pro-v1';
const OFFLINE_PAGE = './index.html';

// Risorse da pre-cachare all'installazione
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;0,9..144,900;1,9..144,400&family=DM+Mono:wght@400;500&display=swap'
];

// ── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────
// Elimina vecchie versioni della cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora richieste non-GET e richieste ad API esterne
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Font Google → Cache First (cambiano raramente)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // App shell e risorse locali → Cache First con fallback a network
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Tutto il resto → Network First con fallback a cache
  event.respondWith(networkFirst(request));
});

// ── STRATEGIE ────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Se non c'è rete né cache, torna la pagina offline
    const fallback = await caches.match(OFFLINE_PAGE);
    return fallback || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match(OFFLINE_PAGE);
  }
}

// ── MESSAGGI DAL CLIENT ───────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Risponde con la versione della cache attiva
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
