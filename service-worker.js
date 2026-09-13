const APP_SHELL_CACHE = "aveniq-shell-v18";
const RUNTIME_CACHE = "aveniq-runtime-v18";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest?v=20260911-1",
  "/styles.css?v=20260911-1",
  "/mobile-shell.js?v=20260911-1",
  "/supabase-config.js?v=20260911-1",
  "/supabase-client.js?v=20260911-1",
  "/vendor/qrcode.js?v=20260911-1",
  "/app.js?v=20260911-1",
  "/assets/brand/sake-street-logo-mark.png",
  "/assets/brand/sake-street-logo-round.webp",
  "/assets/brand/sake-street-logo-full.webp"
];

function isMutableShellAsset(url) {
  return [
    "/",
    "/index.html",
    "/styles.css",
    "/mobile-shell.js",
    "/supabase-config.js",
    "/supabase-client.js",
    "/vendor/qrcode.js",
    "/app.js",
    "/manifest.webmanifest"
  ].includes(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => /^aveniq-(shell|runtime)-/.test(key) && key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" || isMutableShellAsset(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (/\.(?:png|webp|jpg|jpeg|svg)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    if (request.mode === "navigate") return (await cache.match(request)) || (await caches.match("/index.html"));
    return cache.match(request);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const update = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || update;
}
