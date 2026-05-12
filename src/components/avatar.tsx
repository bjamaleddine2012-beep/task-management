import * as React from "react";

import { cn } from "@/lib/utils";

// Tiny visual chip used everywhere a user is referenced (task cards,
// review queue, comments). Renders the user's chosen color background
// with their chosen emoji, or falls back to a colored initial.

const SIZES = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-20 w-20 text-3xl",
} as const;

type Size = keyof typeof SIZES;

export function Avatar({
  name,
  emoji,
  color,
  size = "md",
  className,
}: {
  name?: string | null;
  emoji?: string | null;
  color?: string | null;
  size?: Size;
  className?: string;
}) {
  // Deterministic fallback color from the name so users without a picked
  // color still get a stable identity.
  const fallbackColor = React.useMemo(
    () => stableColor(name ?? ""),
    [name],
  );
  const bg = color ?? fallbackColor;
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium text-white shadow-sm",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: bg }}
      aria-label={name ?? "user"}
    >
      {emoji ? <span aria-hidden>{emoji}</span> : initial}
    </span>
  );
}

// 16 muted-but-distinct family-friendly colors.
const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
];

export const AVATAR_PALETTE = PALETTE;

function stableColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
