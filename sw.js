const CACHE_NAME = "soli-medical-github-pages-v4";
const BASE_URL = new URL("./", self.registration.scope);
const APP_SHELL = [
  new URL("./", BASE_URL).toString(),
  new URL("./manifest.webmanifest", BASE_URL).toString(),
  new URL("./assets/medicenter-icon.png", BASE_URL).toString(),
  new URL("./assets/medicenter-splash.png", BASE_URL).toString()
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cachedResponse) => {
    const networkResponse = fetch(event.request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => cachedResponse || caches.match(new URL("./", BASE_URL).toString()));
    return cachedResponse || networkResponse;
  }));
});
