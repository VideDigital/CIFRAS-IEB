const CACHE_VERSION = "cifras-ieb-v9.0.0";
const RUNTIME_CACHE = "cifras-ieb-runtime-v9.0.0";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=9.0.0",
  "./app.js?v=9.0.0",
  "./firebase-config.js?v=9.0.0",
  "./chord-engine.js?v=9.0.0",
  "./chord-diagrams.js?v=9.0.0",
  "./manifest.webmanifest?v=9.0.0",
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

const OFFLINE_RUNTIME_DEPENDENCIES = [
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs",
  "https://cdn.jsdelivr.net/npm/mammoth@1.12.0/mammoth.browser.min.js",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
];

async function prepareRuntimeDependencies() {
  const cache = await caches.open(RUNTIME_CACHE);

  await Promise.allSettled(
    OFFLINE_RUNTIME_DEPENDENCIES.map(async (url) => {
      const request = new Request(url, { mode:"cors" });
      const existing = await cache.match(request);
      if (existing) return;

      const response = await fetch(request);
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_VERSION)
        .then((cache) => cache.addAll(APP_SHELL)),
      prepareRuntimeDependencies()
    ])
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
      staleWhileRevalidate(request, CACHE_VERSION)
    );
    return;
  }

  if (RUNTIME_HOSTS.has(url.hostname)) {
    event.respondWith(
      staleWhileRevalidate(request, RUNTIME_CACHE)
    );
  }
});


self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREPARE_OFFLINE") return;

  event.waitUntil(
    Promise.all([
      caches.open(CACHE_VERSION)
        .then((cache) => cache.addAll(APP_SHELL)),
      prepareRuntimeDependencies()
    ]).then(() => {
      event.source?.postMessage?.({
        type: "OFFLINE_READY",
        cacheVersion: CACHE_VERSION
      });
    })
  );
});
