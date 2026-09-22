/* Cache-first: una vez abierta, la app funciona sin conexión. */
const CACHE = 'mostrador-v7';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.json',
  './assets/logo.png', './assets/logo-crema.png',
  './assets/icon-192.png', './assets/apple-touch-icon.png', './assets/icon-512.png', './assets/icon-maskable.png',
  './assets/cerdo.jpg', './assets/bodegon-1.jpg', './assets/bodegon-2.jpg',
  './docs/manual.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
