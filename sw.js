// Aislar la caché de otras aplicaciones en el mismo dominio.
const BASE=new URL(self.registration.scope);
const PREFIX=`mi-mandado:${BASE.pathname}:`;
const CACHE=PREFIX+'0.3.0';
const ASSETS=['./','./index.html','./styles.css','./app.mjs','./core.mjs','./storage.mjs','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
const URLS=ASSETS.map(path=>new URL(path,BASE).href);
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  url.search='';url.hash='';
  const asset=URLS.includes(url.href);
  const navigation=event.request.mode==='navigate';
  if(!asset&&!navigation)return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(url.href);
    if(cached)return cached;
    try{return await fetch(event.request);}
    catch{
      if(navigation){const shell=await cache.match(new URL('./index.html',BASE).href);if(shell)return shell;}
      return new Response('Recurso no disponible sin conexión',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
    }
  }));
});
