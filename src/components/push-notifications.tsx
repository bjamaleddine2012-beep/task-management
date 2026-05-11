"use client";

import * as React from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  subscribePushAction,
  unsubscribePushAction,
} from "@/lib/actions/push";

// Browser-only because navigator.serviceWorker + Notification + PushManager
// don't exist on the server.
//
// State machine:
//   unsupported  — browser can't do push at all
//   ios-not-installed — iOS Safari outside the PWA install (push only works inside)
//   prompt   — never asked yet; show "Enable notifications"
//   granted-subscribed   — permission granted and DB has a sub for this device
//   granted-unsubscribed — permission granted but the local sub got revoked
//   denied   — user clicked "Block"; show explainer

type State =
  | "loading"
  | "unsupported"
  | "ios-not-installed"
  | "prompt"
  | "granted-subscribed"
  | "granted-unsubscribed"
  | "denied";

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Std = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Std);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS-only proprietary flag
    window.navigator.standalone === true
  );
}

async function arrayBufferToBase64(buf: ArrayBuffer | null): Promise<string> {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++)
    bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function PushNotifications() {
  const [state, setState] = React.useState<State>("loading");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Initial state detection.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) {
      if (isIos() && !isStandalone()) setState("ios-not-installed");
      else setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    if (Notification.permission !== "granted") {
      setState("prompt");
      return;
    }

    // Permission already granted — check if we have a live subscription.
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "granted-subscribed" : "granted-unsubscribed");
      } catch {
        setState("granted-unsubscribed");
      }
    })();
  }, []);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!PUB) {
        setError("Notifications aren't configured server-side.");
        setBusy(false);
        return;
      }

      // Ensure SW is registered (PwaInstaller also does this but be safe).
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        setBusy(false);
        return;
      }

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // Cast: TS DOM lib types disagree on Uint8Array<ArrayBufferLike>
          // vs ArrayBufferView<ArrayBuffer>; both are valid BufferSource at
          // runtime.
          applicationServerKey: urlBase64ToUint8Array(PUB) as BufferSource,
        }));

      // Extract keys and POST to server.
      const p256dh = await arrayBufferToBase64(sub.getKey("p256dh"));
      const auth = await arrayBufferToBase64(sub.getKey("auth"));

      const result = await subscribePushAction({
        endpoint: sub.endpoint,
        keys: { p256dh, auth },
        userAgent: navigator.userAgent,
      });
      if (!result.ok) {
        setError(result.error || "Failed to save subscription.");
        setBusy(false);
        return;
      }
      setState("granted-subscribed");
    } catch (err) {
      console.error(err);
      setError((err as Error).message || "Couldn't enable notifications.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("granted-unsubscribed");
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return null;

  if (state === "unsupported") return null;

  if (state === "ios-not-installed") {
    return (
      <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
        <Bell className="mr-1 inline h-3.5 w-3.5" />
        For iPhone notifications: tap Share → <strong>Add to Home Screen</strong>,
        then open the installed app and come back to enable.
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        <BellOff className="mr-1 inline h-3.5 w-3.5" />
        Notifications are blocked for this site. Enable them in your browser
        settings to get task alerts.
      </div>
    );
  }

  if (state === "granted-subscribed") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
        <span>
          <Bell className="mr-1 inline h-3.5 w-3.5" />
          Notifications on
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={disable}
          disabled={busy}
        >
          {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Disable
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <span className="text-xs text-muted-foreground">
        <Bell className="mr-1 inline h-3.5 w-3.5" />
        Get notified when admins assign or review your work
      </span>
      <Button
        type="button"
        size="sm"
        onClick={enable}
        disabled={busy}
        className="h-7 px-3 text-xs"
      >
        {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        Enable
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
