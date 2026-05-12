"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";

// Fullscreen image viewer. Tap an image to open; pinch-zoom on mobile
// (uses native browser zoom via overflow:auto on the inner container);
// arrow keys / swipe to navigate.
//
// Usage: keep an `openIndex: number | null` in the parent, render the
// lightbox conditionally, and pass an onClose handler.

export function PhotoLightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: Array<{ url: string; alt?: string }>;
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = React.useState(initialIndex);

  React.useEffect(() => setIdx(initialIndex), [initialIndex]);

  // Lock body scroll while open.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Keyboard navigation.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  // Touch swipe for mobile.
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Only treat as swipe if mostly horizontal and >40px.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) prev();
      else next();
    }
    touchStart.current = null;
  };

  const prev = React.useCallback(
    () => setIdx((i) => (i - 1 + images.length) % images.length),
    [images.length],
  );
  const next = React.useCallback(
    () => setIdx((i) => (i + 1) % images.length),
    [images.length],
  );

  const current = images[idx];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      onClick={(e) => {
        // Close when clicking the dark area, not the image.
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Close (top-right) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Counter (top-center) */}
      {images.length > 1 && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Prev / Next */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous"
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20",
            )}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next"
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20",
            )}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* The image itself. object-contain so it scales to viewport, and
          the wrapping div allows pinch-zoom via touch-action. */}
      <div
        className="flex h-full w-full items-center justify-center p-6"
        style={{ touchAction: "pinch-zoom" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={current.url}
          src={current.url}
          alt={current.alt ?? ""}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}
