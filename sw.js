const CACHE_NAME = 'cache-krono1450-images-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/image-assets.js',
  '/sw.js',
  '/manifest.json',
  '/images/help.webp',
  '/images/icon-192.png',
  '/images/icon-512(1).png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Mise en cache des ressources');
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name.startsWith('cache-krono1450') && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    ))
  );
});