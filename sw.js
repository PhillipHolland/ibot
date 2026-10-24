const CACHE = "ibot-shell-v17";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./wheel.js",
  "./avatar.js",
  "./layout.js",
  "./marquee.js",
  "./list.js",
  "./click.js",
  "./controls.js",
  "./eyes.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./assets/ChicagoKare.woff2",
  "./assets/click.wav",
  "./assets/wheel-noise.png",
];
/** Network first, but a cached shell wins if the network has not answered by then. */
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  // cache: "reload" skips the HTTP cache so a new version never precaches stale files.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter((k) => k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    // Reload open pages only on an update. A first install has nothing stale to replace.
    if (!old.some((k) => k.startsWith("ibot-shell-"))) return;
    const list = await self.clients.matchAll({ type: "window" });
    await Promise.all(list.map((c) => c.navigate(c.url).catch(() => {})));
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/api/")) return;
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === "basic") {
      const copy = res.clone();
      const put = caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      try { event.waitUntil(put); } catch { /* event already settled; the put still runs */ }
    }
    return res;
  });
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: req.mode === "navigate" });
    if (!cached) return network;
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
    return Promise.race([network.catch(() => cached), timeout]);
  })());
});
