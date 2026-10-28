// The app shell offline: after one visit, the page, its code and the WebAssembly runtimes
// open with no connection, so a family can record, write down and make the book in a
// village with no data. Models are kept separately (OPFS and Cache Storage, by the app).
//   - the page: network first, the stored copy when offline
//   - /assets/* (hashed file names): stored on first use, then served from storage
//   - jsDelivr runtimes (pinned versions): the same
// Nothing else is touched: Hugging Face downloads and the Gemini API go straight out.
const SHELL = "tma-shell-v1";
const RUNTIMES = "tma-runtimes-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["./", "./index.html", "./icon.svg", "./manifest.webmanifest"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tma-") && k !== SHELL && k !== RUNTIMES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === "navigate") {
      e.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put("./index.html", copy));
            return res;
          })
          .catch(() => caches.match("./index.html")),
      );
      return;
    }
    if (url.pathname.includes("/assets/")) e.respondWith(cacheFirst(SHELL, req));
    return;
  }
  // pinned runtime versions only (onnxruntime-web@x.y.z, @wllama/wllama@x.y.z)
  if (url.hostname === "cdn.jsdelivr.net" && /@\d+\.\d+\.\d+/.test(url.pathname)) e.respondWith(cacheFirst(RUNTIMES, req));
});
