// Service worker: caches the app so it opens instantly and works offline.
// Bump CACHE when you change any file, so phones pick up the new version.
const CACHE = "app-v167";
const ASSETS = [
  ".",
  "index.html",
  "core.js",
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

// ---- push: the server only says which notification is due ----
// What it says is worked out here, from the copy of your data the app keeps
// in IndexedDB (the same on-device mirror backups restore from). The server
// never sees a count. core.js holds the wording, shared with the app.
importScripts("core.js");

function idbOpen(name, store) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(store)) r.result.createObjectStore(store); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGetKey(name, store, key) {
  const db = await idbOpen(name, store);
  return new Promise((resolve) => {
    const q = db.transaction(store, "readonly").objectStore(store).get(key);
    q.onsuccess = () => { db.close(); resolve(q.result == null ? null : q.result); };
    q.onerror = () => { db.close(); resolve(null); };
  });
}
async function idbPutKey(name, store, key, value) {
  const db = await idbOpen(name, store);
  return new Promise((resolve) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}
// The app's mirror: { at, data: { "count.x": "<json>" } } → { "count.x": value }
async function readState() {
  try {
    const snap = await idbGetKey("count", "snapshot", "latest");
    const out = {};
    if (snap && snap.data) Object.keys(snap.data).forEach((k) => { try { out[k] = JSON.parse(snap.data[k]); } catch (e) {} });
    return out;
  } catch (e) { return {}; }
}
function show(title, body, tag) {
  return self.registration.showNotification(title, { body, tag, icon: "icon-192.png", badge: "icon-192.png" });
}
async function onPush(msg) {
  const state = (await readState()) || {};
  const now = new Date();
  if (msg.kind === "bed") {
    return show("Bedtime", `It's ${bedLabel(state["count.bedTime"] || "23:00")}. Time to wind down.`, "bedtime");
  }
  if (msg.kind === "evening") {
    const shown = [];
    if (state["count.pushNews"] !== false) {
      const seen = (await idbGetKey("count-sw", "kv", "seen").catch(() => null)) || [];
      const news = goodNews(state, now, seen);
      if (news.length) {
        const more = news.length > 1 ? ` (+${news.length - 1} more in the app)` : "";
        shown.push(show("Good news", news[0].text + more, "news"));
        await idbPutKey("count-sw", "kv", "seen", seen.concat(news.map((n) => n.key)).slice(-200)).catch(() => {});
      }
    }
    const ev = eveningSummary(state, now);
    shown.push(show(ev.title, ev.body, "evening"));
    return Promise.all(shown);
  }
  if (msg.kind === "test") return show("Push is working", "Notifications will arrive even with the app closed.", "test");
  return show("Tracker", "Open the app to see what's new.", "push");
}
self.addEventListener("push", (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch (e) {}
  // iPhone requires every push to show something, so this always does
  event.waitUntil(onPush(msg).catch(() => show("Tracker", "Open the app to see what's new.", "push")));
});

// Tapping a reminder should bring the app up, not just dismiss the banner.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./");
    })
  );
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
