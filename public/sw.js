// Service worker for Web Push (PRD §12.3). Shows the reminder and opens the in-app inbox on click,
// where the user can open the item, mark a task done or snooze (all with their normal session).
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* ignore malformed payloads */ }
  const title = typeof data.title === "string" ? data.title : "Pet Care Hub";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body : "",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    icon: "/pwa-icon/192",
    badge: "/pwa-icon/192",
    data: { url: "/notifications" }, // fixed same-origin path; never taken from the payload
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.url ?? "/notifications", self.location.origin).href;
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = open.find((c) => new URL(c.url).origin === self.location.origin);
    if (same) { await same.navigate(url); return same.focus(); }
    return self.clients.openWindow(url);
  })());
});
