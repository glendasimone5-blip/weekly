// Weekly service worker: shows reminders when the push server pings. Pings carry no text;
// titles are read from this device's own copy (IndexedDB), written by the app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function openDb(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('weekly-sw', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('reminders', { keyPath:'rid' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function takeDueReminders(){
  const db = await openDb();
  return new Promise((res) => {
    const tx = db.transaction('reminders', 'readwrite'), st = tx.objectStore('reminders'), due = [], now = Date.now();
    st.openCursor().onsuccess = (e) => {
      const c = e.target.result; if(!c) return;
      const v = c.value;
      if(!v.shown && v.at <= now + 90000 && v.at >= now - 3*3600000){ due.push(v); v.shown = true; c.update(v); }
      c.continue();
    };
    tx.oncomplete = () => { db.close(); res(due); };
    tx.onerror = () => { db.close(); res([]); };
  });
}
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    const due = await takeDueReminders();
    const wins = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    if(wins.some(w => w.visibilityState === 'visible')) return;   // the open app shows its own popup
    if(!due.length){ await self.registration.showNotification('Weekly', { body:'You have a reminder.', tag:'weekly-generic' }); return; }
    for(const r of due) await self.registration.showNotification(r.title, { body:r.body || '', tag:r.rid });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    if(wins.length) return wins[0].focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
