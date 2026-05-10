// Minimal service worker — exists to make the site installable as a PWA on
// Android / iOS. Doesn't try to cache routes (server actions and live data
// don't cache safely without a more careful strategy). Future: add a stale-
// while-revalidate cache for static assets.

self.addEventListener("install", (event) => {
  // Activate immediately on first install.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of any open tabs.
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch handler. Browsers require a fetch listener to consider
// the SW "installable" for PWA prompts on some platforms.
self.addEventListener("fetch", (event) => {
  // Network only — no offline support yet.
  return;
});
