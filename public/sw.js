// MyTown push notification service worker.
// Deliberately minimal -- this only handles push display and click routing,
// it does not do any offline caching/PWA-shell work.

self.addEventListener("push", (event) => {
  let payload = { title: "MyTown", body: "Your order status changed.", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* fall back to defaults above */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      image: payload.image || undefined,
      tag: payload.tag || undefined,
      renotify: Boolean(payload.tag),
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
