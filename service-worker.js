const CACHE_VERSION = "cifras-ieb-v7.1.0";
const RUNTIME_CACHE = "cifras-ieb-runtime-v7.1.0";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=7.1.0",
  "./app.js?v=7.1.0",
  "./firebase-config.js?v=7.1.0",
  "./chord-engine.js?v=7.1.0",
  "./chord-diagrams.js?v=7.1.0",
  "./manifest.webmanifest?v=7.1.0",
  "./offline.html",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

const RUNTIME_HOSTS = new Set([
  "www.gstatic.com",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => ![CACHE_VERSION, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName, fallbackRequest = null) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (response && (response.ok || response.type === "opaque")) {
      cache.put(request, response.clone()).catch(() => {});
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (fallbackRequest) {
      const fallback =
        await caches.match(fallbackRequest) ||
        await caches.match("./offline.html");

      if (fallback) return fallback;
    }

    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === "opaque")) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  return cached || networkPromise || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, CACHE_VERSION, "./index.html")
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      networkFirst(request, CACHE_VERSION)
    );
    return;
  }

  if (RUNTIME_HOSTS.has(url.hostname)) {
    event.respondWith(
      staleWhileRevalidate(request, RUNTIME_CACHE)
    );
  }
});
