"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps the current page's server-rendered data fresh without a manual
// refresh. Two triggers:
//
//   1. Service worker `data-changed` message — fired whenever a push
//      notification arrives. Means someone else mutated something
//      (admin assigned a task, user submitted proof, etc.).
//
//   2. document `visibilitychange` to "visible" — fired when the tab
//      becomes active again. Catches the case where the user got a
//      notification on a different device, or just switched apps and
//      came back. Cheap belt-and-suspenders.
//
// `router.refresh()` re-runs the server component, server-renders fresh
// HTML, and React diffs it into the existing client tree — so client
// state (dialog open / form input) survives the refresh.

export function RealtimeRefresher() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refresh = () => router.refresh();

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "data-changed") refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
