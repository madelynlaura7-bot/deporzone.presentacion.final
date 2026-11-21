/* Service Worker de DeporZone: proxy invisible entre navegador y red (evento fetch) */
const CACHE = "deporzone-v3";
const SHELL = [
  "./", "index.html", "styles.css", "script.js", "manifest.json",
  "vendor/jquery-3.6.1.min.js", "vendor/purify-3.4.14.min.js",
  "data/canchas.json", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"
].concat(Array.from({ length: 16 }, (_, i) => "img/cancha-" + String(i + 1).padStart(2, "0") + ".svg"));

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Catálogo JSON: primero red (datos frescos); sin internet, sirve Cache Storage
  if (url.origin === location.origin && url.pathname.endsWith("/data/canchas.json")) {
    e.respondWith(
      fetch(e.request)
        .then(res => { const copia = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Resto: primero caché; si no está, red y se guarda. Sin red y sin caché: portada offline
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.ok && url.origin === location.origin) {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
      }
      return res;
    }).catch(() => e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))
  );
});
