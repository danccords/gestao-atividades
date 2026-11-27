// Service worker: permite instalar o app e abrir mais rápido.
// Arquivos do app: tenta a rede primeiro (sempre a versão mais nova) e usa cache se estiver offline.
// Dados do Supabase nunca são guardados em cache.
const CACHE = 'ga-v35';
const SHELL = ['./', './index.html', './styles.css', './app.js', './minipdf.js', './config.js', './logos/allos.jpg', './logos/genica.jpg', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // 'no-cache': sempre confere com o servidor se há versão nova (não usa cópia velha do navegador)
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
// Ao tocar na notificação, abre o app em "Minhas atividades"
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate('./#/minhas'); return c.focus(); } }
    return self.clients.openWindow('./#/minhas');
  }));
});
