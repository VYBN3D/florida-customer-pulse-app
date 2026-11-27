const CACHE="florida-customer-pulse-v4";
const FILES=["./","./index.html","./styles.css","./app.js","./config.js","./manifest.webmanifest","./assets/icon.svg","./assets/icon-192.png","./assets/icon-512.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 const request=event.request;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||request.method!=="GET")return;
 const networkFirst=request.mode==="navigate"||/\.(?:html|js|css)$/.test(url.pathname);
 if(networkFirst){
  event.respondWith(fetch(request).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
   return response;
  }).catch(()=>caches.match(request).then(cached=>cached||caches.match("./index.html"))));
  return;
 }
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
  return response;
 })));
});
