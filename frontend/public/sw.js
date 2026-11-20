/*
 * Crewboard service worker.
 *
 * Why: the free server sleeps when nobody uses it and takes 30-60 s to wake. While it sleeps it can't
 * even send the page, so visitors saw a blank screen. This keeps a copy of the app on the device:
 *   - pages: try the network for 3 s, then open the saved copy (which shows "Waking up the server…")
 *   - /assets/*: hashed files, served from the saved copy, downloaded once
 *   - /api and /socket.io: never touched (always live)
 */
const SHELL = 'crewboard-shell-v1';
const ASSETS = 'crewboard-assets-v1';
const NETWORK_WAIT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.add('/'))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL && key !== ASSETS) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/') || url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') return event.respondWith(page(req));
  if (url.pathname.startsWith('/assets/')) return event.respondWith(asset(req));
});

/** Every route is the same single-page app, so one saved copy of "/" serves them all. */
async function page(req) {
  const cache = await caches.open(SHELL);
  const saved = await cache.match('/');
  const network = fetch(req)
    .then((res) => {
      if (res.ok) {
        cache.put('/', res.clone());
        return res;
      }
      return saved || res; // e.g. the host's error page while the server starts
    })
    .catch(() => saved || Response.error());

  if (!saved) return network; // first visit: nothing saved yet, wait for the server
  const timeout = new Promise((resolve) => setTimeout(() => resolve(saved), NETWORK_WAIT_MS));
  return Promise.race([network, timeout]); // the network keeps going and refreshes the saved copy
}

async function asset(req) {
  const cache = await caches.open(ASSETS);
  const saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
