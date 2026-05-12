"use client";

import * as React from "react";

// Tiny wrapper around canvas-confetti. Two ways to use:
//
//   1. Imperatively: `import { fireConfetti } from "@/components/confetti"`
//      and call from a click handler (e.g. after an approve toast).
//
//   2. Declaratively: render `<ConfettiBurst trigger={count} />` where
//      `count` is a number you increment to re-fire (e.g. when a new
//      achievement unlocks across renders).
//
// canvas-confetti is ~5 KB minified and ships its own renderer canvas,
// so we don't have to wire anything into the layout.

import type confettiLib from "canvas-confetti";

let _confetti: typeof confettiLib | null = null;

async function getConfetti(): Promise<typeof confettiLib> {
  if (_confetti) return _confetti;
  const mod = await import("canvas-confetti");
  _confetti = mod.default;
  return _confetti;
}

export async function fireConfetti(opts?: {
  particleCount?: number;
  spread?: number;
  origin?: { x?: number; y?: number };
}): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const fn = await getConfetti();
    fn({
      particleCount: opts?.particleCount ?? 80,
      spread: opts?.spread ?? 70,
      origin: { x: opts?.origin?.x ?? 0.5, y: opts?.origin?.y ?? 0.6 },
      ticks: 200,
    });
  } catch {
    // No-op on failure — visual sugar isn't critical.
  }
}

export function ConfettiBurst({
  trigger,
  big,
}: {
  trigger: number;
  big?: boolean;
}) {
  const lastFired = React.useRef(0);
  React.useEffect(() => {
    if (trigger > lastFired.current) {
      lastFired.current = trigger;
      // Skip the initial-render firing (trigger=0).
      if (trigger > 0) {
        if (big) {
          // A bigger burst, fired from both sides for celebrations.
          void fireConfetti({ particleCount: 120, origin: { x: 0.2 } });
          void fireConfetti({ particleCount: 120, origin: { x: 0.8 } });
        } else {
          void fireConfetti();
        }
      }
    }
  }, [trigger, big]);
  return null;
}
