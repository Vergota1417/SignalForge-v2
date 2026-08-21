const CACHE_NAME='signalforge-shell-v1';
const APP_SHELL=['/','/index.html','/styles.css','/config.js','/app.js','/pwa.js','/manifest.webmanifest','/icons/signalforge-icon.svg','/icons/signalforge-maskable.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
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

  // Never cache live API responses. Market data and signal state must remain network-fresh.
  if (url.origin===self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode==='navigate') {
    event.respondWith(
      fetch(request)
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put('/index.html',copy));
          return response;
        })
        .catch(()=>caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if (response.ok && url.origin===self.location.origin) {
        const copy=response.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));
      }
      return response;
    }))
  );
});

self.addEventListener('message',event=>{
  if (event.data?.type==='SKIP_WAITING') self.skipWaiting();
});
