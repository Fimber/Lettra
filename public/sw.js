const CACHE = "lettra-v3-streaming";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/icon.svg"])),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("lettra-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  const writes = [];
  const response = (async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === "navigate") {
      try {
        const response = await fetch(event.request);
        if (response.ok)
          writes.push(
            cache.put(event.request, response.clone()).catch(() => {}),
          );
        return response;
      } catch {
        return (await cache.match(event.request)) || (await cache.match("/"));
      }
    }
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    // Deliver large reader assets immediately. A slow or full cache must
    // never prevent an otherwise successful network response reaching OCR.
    if (response.ok)
      writes.push(cache.put(event.request, response.clone()).catch(() => {}));
    return response;
  })();
  event.respondWith(response);
  // Register the lifetime promise synchronously, but keep persistence out of
  // the response's critical path. Failed writes leave online reading usable.
  event.waitUntil(response.then(() => Promise.all(writes)).catch(() => {}));
});
