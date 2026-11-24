// lưu sẵn app để mở được cả khi không có mạng
const BAN = 'quet-bai-thi-v5';
const TEP = ['./', './index.html', './quet.js?v=3', './app.js?v=5', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(BAN).then(c => c.addAll(TEP))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== BAN).map(x => caches.delete(x))))); self.clients.claim(); });
// ưu tiên bản mới trên mạng, mất mạng thì dùng bản đã lưu
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(BAN).then(b => b.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match('./index.html'))));
});
