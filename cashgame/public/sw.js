/**
 * Minimal, financially-safe service worker.
 *
 * Policy: NEVER cache or queue API requests. Financial writes must reach the
 * server or fail visibly (the UI blocks writes while offline). Only static
 * assets and the app shell are cached for faster loads and read-only offline
 * viewing of already-loaded pages.
 */
const CACHE = "cashgame-static-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls or non-GET requests — the server is the truth.
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  // Static assets: stale-while-revalidate.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
  // Pages: network-first (no stale financial data), no offline fabrication.
});
