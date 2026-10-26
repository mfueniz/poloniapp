// poloniapp — service worker: permite instalar el sitio como app, lo deja usable sin
// conexión (última versión vista) y muestra las notificaciones push.

const CACHE = 'poloniapp-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/fonts.css',
  './assets/css/site.css',
  './assets/js/api.js',
  './assets/js/app.js',
  './assets/js/pwa.js',
  './assets/fonts/google-sans-latin.woff2',
  './assets/img/poloniapp-logo.svg',
  './assets/img/favicon.svg',
  './assets/img/para-rezar-hoy.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (siempre lo más nuevo); si no hay conexión, lo último guardado.
// La API y el panel admin nunca se guardan.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/') || url.pathname.includes('/admin/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});

// El servidor manda el aviso vacío; el texto se pide a la API (ver api/_lib/push.php).
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let msg = null;
      try {
        msg = event.data ? event.data.json() : null;
      } catch {
        msg = null;
      }
      if (!msg) {
        try {
          const res = await fetch('./api/?action=push_message', { cache: 'no-store' });
          msg = await res.json();
        } catch {
          msg = { title: 'Poloniapp', body: 'Hay novedades en Poloniapp.', url: './' };
        }
      }
      await self.registration.showNotification(msg.title || 'Poloniapp', {
        body: msg.body || '',
        icon: './assets/img/icon-192.png',
        badge: './assets/img/icon-192.png',
        tag: 'poloniapp-' + (msg.ts || Date.now()),
        data: { url: new URL(msg.url || './', self.registration.scope).href },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
