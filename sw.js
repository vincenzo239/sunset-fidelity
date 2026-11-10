const CACHE="sunset-fidelity-shell-v2";
const SHELL=["./","./index.html","./styles.css","./manifest.webmanifest","./assets/sunset-icon-192.png","./assets/sunset-icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||u.pathname.endsWith("/app.js")||u.pathname.endsWith("/config.js"))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok&&e.request.method==="GET"){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request)))});
