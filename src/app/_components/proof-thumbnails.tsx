"use client";

import * as React from "react";

import { PhotoLightbox } from "@/components/photo-lightbox";

// Small thumbnail grid for proof images on the user dashboard's task
// card. Clicking any thumbnail opens the lightbox starting at that
// image. Server components can use it directly because it's a client
// component that takes plain data.

export function ProofThumbnails({
  images,
  max = 4,
}: {
  images: Array<{ id: string; url: string }>;
  max?: number;
}) {
  const [open, setOpen] = React.useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {images.slice(0, max).map((img, i) => (
          <button
            type="button"
            key={img.id}
            onClick={() => setOpen(i)}
            className="block aspect-square overflow-hidden rounded-md border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt="Proof"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
        {images.length > max && (
          <button
            type="button"
            onClick={() => setOpen(max)}
            className="flex aspect-square items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground"
          >
            +{images.length - max}
          </button>
        )}
      </div>

      {open !== null && (
        <PhotoLightbox
          images={images.map((i) => ({ url: i.url }))}
          initialIndex={open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
