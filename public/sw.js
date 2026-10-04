// MIRA service worker: an offline page and static assets only. Pages are never cached:
// they're rendered with the signed-in person's name, places and contacts, and must not
// outlive sign-out or be shown to the next person on a shared phone. API responses and
// live trip data are never cached either (private and time-sensitive).
// v2 replaces v1, which cached personal pages; activation deletes the old cache.
const CACHE = "mira-shell-v7";
const SHELL = ["/offline.html", "/offline.js", "/daypart.js", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/t/") || url.pathname.startsWith("/invite") || url.pathname.startsWith("/auth/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/offline.html")));
    return;
  }
  // The offline page's own script and files: fresh when online, the cached copy when not. Without this the offline
  // page loaded but /offline.js didn't, so it had no call buttons (re-audit RA1, P08-005).
  if (SHELL.includes(url.pathname)) {
    e.respondWith(fetch(e.request).catch(() => caches.match(url.pathname)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    })));
  }
});

// Web Push to the traveller (her own updates only: contact accepted, missed check-in, location
// paused, an alert that may not have gone out). Payloads carry no location. Tapping opens MIRA
// on the page the update is about — same-origin paths only.
self.addEventListener("push", (e) => {
  let data = { title: "MIRA", body: "", href: "/inbox" };
  try {
    data = { ...data, ...(e.data ? e.data.json() : {}) };
  } catch {
    /* not JSON: show the default */
  }
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icon-192.png", badge: "/icon-192.png", data: { href: data.href }, tag: data.tag }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const raw = e.notification.data && e.notification.data.href;
  const href = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : "/inbox";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (new URL(c.url).origin === location.origin && "focus" in c) return c.navigate(href).then((w) => (w || c).focus());
      return self.clients.openWindow(href);
    }),
  );
});
