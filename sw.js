// Service worker: rende "I miei vinili" utilizzabile offline.
const CACHE = "vinili-v21";
const COVERS = "vinili-covers";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const COVER_HOSTS = ["mzstatic.com", "books.google.com", "books.googleusercontent.com", "covers.openlibrary.org", "archive.org", "dzcdn.net", "wikimedia.org"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("vinili-") && k !== CACHE && k !== COVERS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(cacheName, req) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  try { const res = await fetch(req); if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()); return res; }
  catch (err) { return new Response("", { status: 504 }); }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Libreria per leggere i codici a barre.
  if (url.hostname === "unpkg.com") { e.respondWith(cacheFirst(CACHE, req)); return; }

  // Font di Google.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(cacheFirst(CACHE, req));
    return;
  }

  // Copertine mostrate nelle pagine (immagini): conservate per l'uso offline.
  if (req.destination === "image" && url.origin !== location.origin) {
    e.respondWith(cacheFirst(COVERS, req));
    return;
  }

  if (url.origin !== location.origin) return;

  // Pagina dell'app: prima la rete (così gli aggiornamenti arrivano subito), la cache se offline.
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(req, { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(t);
        if (res && res.ok) { c.put("index.html", res.clone()); return res; }
        throw 0;
      } catch (err) {
        return (await c.match("index.html")) || (await c.match("./")) || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Altri file dell'app: dalla cache, aggiornati in background.
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => undefined);
    return hit || (await net) || new Response("Offline", { status: 503 });
  }));
});
