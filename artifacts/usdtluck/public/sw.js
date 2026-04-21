const SW_VERSION = "securepool-sw-v2";
const SHELL_CACHE = `${SW_VERSION}-shell`;
const ASSET_CACHE = `${SW_VERSION}-assets`;
const API_CACHE = `${SW_VERSION}-api`;

const SHELL_FILES = ["/", "/index.html", "/manifest.json", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, ASSET_CACHE, API_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

function isStaticAsset(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  const path = url.pathname;
  return (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font" ||
    request.destination === "image" ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".woff") ||
    path.endsWith(".woff2") ||
    path.endsWith(".png") ||
    path.endsWith(".svg") ||
    path.endsWith(".ico")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Network-first API strategy.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Never cache error responses — otherwise a transient 502/503/500 can "stick"
          // and the SPA will keep replaying it from Cache Storage forever.
          if (networkResponse.ok) {
            const cloned = networkResponse.clone();
            void caches.open(API_CACHE).then((cache) => cache.put(request, cloned));
          } else {
            void caches.open(API_CACHE).then(async (cache) => {
              try {
                await cache.delete(request);
              } catch {
                /* ignore */
              }
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Cache-first for static assets.
  if (isStaticAsset(request)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkResponse) => {
          const cloned = networkResponse.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(request, cloned));
          return networkResponse;
        });
      }),
    );
    return;
  }

  // App shell fallback for navigation.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/index.html");
        return cached || Response.error();
      }),
    );
  }
});
