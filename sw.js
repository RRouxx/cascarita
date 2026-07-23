// Service worker de Cascarita (PWA). Sube VERSION para forzar actualización.
const VERSION = "casc-v2";
const SHELL = [
  "/", "/index.html",
  "/assets/hub.js", "/assets/hub.css",
  "/assets/icon-192.png", "/assets/icon-512.png", "/assets/favicon.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Solo manejamos GET del MISMO origen. Anuncios, Google, ESPN, radio-browser y
// cualquier /api/* pasan directo a la red (nunca se cachean).
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;         // cross-origin: sin tocar
  if (url.pathname.startsWith("/api/")) return;            // datos vivos: nunca cache

  // Navegaciones (páginas de juego): red primero, cae al cache, y si no, a la portada.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(res => {
        const copia = res.clone();
        caches.open(VERSION).then(c => c.put(req, copia));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match("/index.html")))
    );
    return;
  }

  // Assets estáticos (css/js/png/svg/json/webmanifest): cache primero + refresco en 2º plano.
  e.respondWith(
    caches.match(req).then(cacheado => {
      const red = fetch(req).then(res => {
        if (res && res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
        return res;
      }).catch(() => cacheado);
      return cacheado || red;
    })
  );
});

// ---- Web Push: mostrar el aviso ----
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: (e.data && e.data.text()) || "" }; }
  const title = d.title || "⚽ Cascarita";
  const opts = {
    body: d.body || "Tus retos de hoy ya están.",
    icon: d.icon || "/assets/icon-192.png",
    badge: "/assets/icon-192.png",
    data: { url: d.url || "/" },
    tag: "cascarita-dia",           // reemplaza el anterior en vez de apilar
    renotify: true,
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// ---- Clic en el aviso: enfoca una pestaña abierta o abre la URL ----
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
      for (const c of cs) { if ("focus" in c) { c.navigate(destino); return c.focus(); } }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});
