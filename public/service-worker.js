const CACHE_NAME='signalforge-shell-v3';
const APP_SHELL=['/','/index.html','/styles.css','/pwa.css','/config.js','/app.js','/pwa.js','/manifest.webmanifest','/icons/signalforge-icon.svg','/icons/signalforge-maskable.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if (request.method!=='GET') return;
  const url=new URL(request.url);

  // Market data and signal state must never be served from an offline cache.
  if (url.origin===self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.origin!==self.location.origin) return;

  // Network-first keeps installed phones on the latest deployed UI while still
  // allowing the shell to open offline if the network is temporarily unavailable.
  event.respondWith(
    fetch(request).then(response=>{
      if (response.ok) {
        const copy=response.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(request.mode==='navigate' ? '/index.html' : request,copy));
      }
      return response;
    }).catch(()=>request.mode==='navigate' ? caches.match('/index.html') : caches.match(request))
  );
});

self.addEventListener('message',event=>{
  if (event.data?.type==='SKIP_WAITING') self.skipWaiting();
});
