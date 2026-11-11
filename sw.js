const CACHE="sunset-fidelity-shell-v3";
const SHELL=["./","./index.html","./styles.css","./manifest.webmanifest","./assets/LOGO%20S.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||u.pathname.endsWith("/app.js")||u.pathname.endsWith("/config.js"))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok&&e.request.method==="GET"){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request)))});

self.addEventListener("push",event=>{
  let payload={};
  try{payload=event.data?event.data.json():{}}catch{payload={title:"SUNSET FIDELITY",body:event.data?.text()||"Hai ricevuto un aggiornamento sui tuoi punti."}}
  const title=payload.title||"SUNSET FIDELITY";
  const options={body:payload.body||"Hai ricevuto punti sulla tua tessera.",icon:"./assets/LOGO%20S.png",badge:"./assets/LOGO%20S.png",tag:payload.tag||"sunset-points",data:{url:payload.url||"./"}};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const scope=self.registration.scope;
  const target=new URL(event.notification.data?.url||"./",scope);
  if(target.origin!==self.location.origin||!target.href.startsWith(scope))target.href=scope;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windowClients=>{
    for(const client of windowClients){if(client.url.startsWith(scope))return client.focus().then(()=>client.navigate(target.href))}
    return clients.openWindow(target.href);
  }));
});
