/**
 * FlightDeal AI — Service Worker
 * Handles Web Push notification display and click actions.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "FlightDeal AI", body: event.data.text() };
  }

  const options = {
    body:    payload.body   || "",
    icon:    payload.icon   || "/icon-192.png",
    badge:   payload.badge  || "/badge-72.png",
    tag:     payload.tag    || "flightdeal-alert",
    data:    payload.data   || {},
    actions: [
      { action: "view",    title: "View Deal" },
      { action: "dismiss", title: "Dismiss"   },
    ],
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "FlightDeal AI", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow("/");
    })
  );
});
