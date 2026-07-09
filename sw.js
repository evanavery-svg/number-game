// Service worker: caches the app so it opens instantly and works offline.
// Bump CACHE when you change any file, so phones pick up the new version.
const CACHE = "app-v56";
const ASSETS = [
  ".",
  "index.html",
  "app.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Page loads (and app.js) go network-first so a new version shows up
  // immediately when online, instead of being stuck on a cached copy.
  // This is what kept the installed Home Screen app from updating.
  const req = event.request;
  const isPage = req.mode === "navigate" || /\.(html|js)$/.test(new URL(req.url).pathname);

  if (isPage) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else (icons, manifest): cache-first for speed, refresh in background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
