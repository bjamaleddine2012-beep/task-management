"use client";

import * as React from "react";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";

// Registers the service worker on first paint and shows a small install
// prompt when the browser fires `beforeinstallprompt`. Dismissed prompts are
// remembered for 7 days so we don't nag.

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstaller() {
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = React.useState(false);

  // Register the SW once.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] SW register failed", err);
    });
  }, []);

  // Listen for the install prompt.
  React.useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const onInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const onDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border bg-card p-3 shadow-lg sm:bottom-6">
      <div className="flex-1">
        <p className="text-sm font-medium">Install Task Management</p>
        <p className="text-xs text-muted-foreground">
          Add it to your home screen for one-tap access.
        </p>
      </div>
      <Button size="sm" onClick={onInstall}>
        <Download className="mr-1 h-4 w-4" />
        Install
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md p-1 text-muted-foreground hover:bg-accent"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
