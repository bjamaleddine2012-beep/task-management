// Service worker — handles PWA install eligibility AND Web Push.
//
// Push flow:
//   1. Server sends a push payload via web-push (POST to the user's
//      browser endpoint).
//   2. The browser wakes this worker and fires the `push` event.
//   3. We show a notification with the payload's title/body.
//   4. Tap → opens the URL we attached, focusing an existing tab if any.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No offline caching strategy yet — pass through.
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Task Management", body: event.data?.text() || "" };
  }
  const title = payload.title || "Task Management";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag, // collapses duplicates
    data: { url: payload.url || "/" },
    requireInteraction: payload.requireInteraction === true,
  };

  const work = [self.registration.showNotification(title, options)];

  // Red bubble on the app icon. Same API WhatsApp / iMessage use on Android
  // and Safari PWAs. typeof check covers older browsers gracefully.
  if (
    typeof payload.badge === "number" &&
    typeof navigator !== "undefined" &&
    "setAppBadge" in navigator
  ) {
    work.push(
      payload.badge > 0
        ? navigator.setAppBadge(payload.badge)
        : navigator.clearAppBadge(),
    );
  }

  event.waitUntil(Promise.all(work));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab if its URL prefix matches.
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
