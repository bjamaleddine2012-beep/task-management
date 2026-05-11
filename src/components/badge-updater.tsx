"use client";

import { useEffect } from "react";

// Sets the home-screen / dock icon badge bubble to `count`.
// Same API WhatsApp etc. use. Silently does nothing on browsers that
// don't expose setAppBadge (Firefox, older Safari).
//
// Rendered on every page that fetches the user's task state, so the badge
// stays in sync as soon as the user revalidates the data.

export function BadgeUpdater({ count }: { count: number }) {
  useEffect(() => {
    if (typeof navigator === "undefined") return;

    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    if (!nav.setAppBadge) return;

    if (count > 0) {
      nav.setAppBadge(count).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [count]);

  return null;
}
