"use client";

import * as React from "react";
import { Camera, ImagePlus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";

// Live camera capture inside the dialog.
// - Requests rear camera via getUserMedia.
// - Renders a video preview and a big shutter button.
// - Tapping the shutter draws the current frame to a canvas and converts
//   it to a JPEG File, which is handed off to the parent.
// - If permission is denied or the browser doesn't support cameras, the
//   `<input type="file" capture>` fallback button covers it.

export function CameraCapture({
  onCapture,
  onFallbackFiles,
  disabled,
}: {
  onCapture: (file: File) => void;
  onFallbackFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [facing, setFacing] = React.useState<"environment" | "user">(
    "environment",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);

  const start = React.useCallback(
    async (mode: "environment" | "user") => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) {
        setError("Camera not supported in this browser.");
        return;
      }
      setStarting(true);
      setError(null);
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        setStream((old) => {
          old?.getTracks().forEach((t) => t.stop());
          return s;
        });
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          // play() can reject if interrupted; ignore.
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        const e = err as Error;
        // Translate the most common error names into something readable.
        if (e.name === "NotAllowedError") {
          setError("Camera permission denied. Use the gallery button below.");
        } else if (e.name === "NotFoundError") {
          setError("No camera found on this device.");
        } else if (e.name === "NotReadableError") {
          setError("Camera is in use by another app.");
        } else {
          setError(e.message || "Couldn't open the camera.");
        }
      } finally {
        setStarting(false);
      }
    },
    [],
  );

  // Start on mount; stop on unmount.
  React.useEffect(() => {
    start(facing);
    return () => {
      // capture stream from closure — using state via setter wouldn't run.
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const handleSwitch = () => {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    start(next);
  };

  const handleShutter = async () => {
    const v = videoRef.current;
    if (!v || !stream) return;
    setCapturing(true);
    try {
      const w = v.videoWidth;
      const h = v.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2d unsupported.");
      ctx.drawImage(v, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Couldn't capture frame.");
      const file = new File([blob], `photo-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      onCapture(file);
      // Brief flash effect: fade the preview.
      setTimeout(() => setCapturing(false), 120);
    } catch (err) {
      console.error(err);
      setError("Capture failed. Try again.");
      setCapturing(false);
    }
  };

  const handlePickFromGallery = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFallbackFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      {/* Hidden file picker for the gallery fallback. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black sm:aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {capturing && (
          <div className="absolute inset-0 animate-pulse bg-white/50" />
        )}
        {(starting || !stream) && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Starting camera…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white">
            <p>{error}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => start(facing)}
            >
              Try again
            </Button>
          </div>
        )}

        {/* Switch camera button (top right) */}
        {stream && (
          <button
            type="button"
            onClick={handleSwitch}
            disabled={disabled || starting}
            aria-label="Switch camera"
            className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white transition-opacity hover:bg-black/80 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Shutter row */}
      <div className="flex items-center justify-center gap-3 py-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePickFromGallery}
          disabled={disabled}
          className="absolute-left"
        >
          <ImagePlus className="mr-1 h-4 w-4" />
          Gallery
        </Button>
        <button
          type="button"
          onClick={handleShutter}
          disabled={disabled || !stream || capturing}
          aria-label="Take photo"
          className="grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-primary text-primary-foreground shadow-lg ring-2 ring-primary transition-transform active:scale-95 disabled:opacity-50"
        >
          <Camera className="h-6 w-6" />
        </button>
        <span className="w-[88px]" /> {/* spacer to center the shutter */}
      </div>
    </div>
  );
}
