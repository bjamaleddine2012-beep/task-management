"use client";

import * as React from "react";
import { upload } from "@vercel/blob/client";
import { Camera, Loader2, MapPin, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { submitProofAction } from "@/lib/actions/tasks";

const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_BYTES = 16 * 1024 * 1024; // 16 MB per photo
const MAX_PHOTOS = 10;

type Step = "idle" | "geolocating" | "uploading" | "saving";

type StagedFile = {
  id: string;
  file: File;
  previewUrl: string;
};

type Geo = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export function SubmitProofDialog({
  taskId,
  taskTitle,
  isResubmit,
}: {
  taskId: string;
  taskTitle: string;
  isResubmit?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [staged, setStaged] = React.useState<StagedFile[]>([]);
  const [includeLocation, setIncludeLocation] = React.useState(true);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });

  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    return () => {
      // Cleanup all preview URLs on unmount.
      for (const s of staged) URL.revokeObjectURL(s.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    for (const s of staged) URL.revokeObjectURL(s.previewUrl);
    setStaged([]);
    setStep("idle");
    setError(null);
    setProgress({ done: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const remaining = MAX_PHOTOS - staged.length;
    const accepted: StagedFile[] = [];
    for (const f of files.slice(0, remaining)) {
      if (!ALLOWED.includes(f.type)) {
        setError(`${f.name}: unsupported format`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`${f.name}: too large (16 MB max)`);
        continue;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
      });
    }
    setStaged((prev) => [...prev, ...accepted]);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  };

  const captureGeo = async (): Promise<Geo | null> => {
    if (!includeLocation) return null;
    if (!("geolocation" in navigator)) return null;
    return new Promise<Geo | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: Math.round(pos.coords.accuracy),
          }),
        () => resolve(null), // user denied — fail open
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
      );
    });
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (staged.length === 0) {
      setError("Pick at least one photo.");
      return;
    }
    setError(null);

    try {
      // 1. Capture location once for the whole submission. Cheaper than
      //    once-per-image and accurate enough — the user is in one place.
      setStep("geolocating");
      const geo = await captureGeo();

      // 2. Upload all files in parallel directly to Vercel Blob.
      setStep("uploading");
      setProgress({ done: 0, total: staged.length });
      const capturedAt = new Date().toISOString();

      const uploaded = await Promise.all(
        staged.map(async (s) => {
          const ext = s.file.name.split(".").pop()?.toLowerCase() || "jpg";
          const blob = await upload(
            `task-proofs/${taskId}/${Date.now()}-${s.id}.${ext}`,
            s.file,
            {
              access: "public",
              handleUploadUrl: "/api/blob/upload",
              contentType: s.file.type,
            },
          );
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          return {
            url: blob.url,
            latitude: geo?.latitude,
            longitude: geo?.longitude,
            accuracyMeters: geo?.accuracyMeters,
            capturedAt,
          };
        }),
      );

      // 3. Tell the server.
      setStep("saving");
      const result = await submitProofAction({ id: taskId, images: uploaded });
      if (result && !result.ok) {
        setError(result.error);
        setStep("idle");
        return;
      }

      setOpen(false);
      reset();
    } catch (err) {
      console.error(err);
      const msg = (err as Error).message ?? "";
      setError(
        msg.includes("Unauthorized")
          ? "Your session expired. Please sign in again."
          : msg.includes("not configured") || msg.includes("token")
            ? "Photo upload isn't configured yet — ask your admin to set up Blob storage."
            : "Upload failed. Try again.",
      );
      setStep("idle");
    }
  };

  const busy = step !== "idle";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          setOpen(o);
          if (!o) reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={isResubmit ? "destructive" : "default"}>
          {isResubmit ? (
            <RefreshCw className="mr-1 h-4 w-4" />
          ) : (
            <Camera className="mr-1 h-4 w-4" />
          )}
          {isResubmit ? "Resubmit" : "Submit proof"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isResubmit ? "Resubmit for review" : "Submit for review"}
          </DialogTitle>
          <DialogDescription>
            Upload up to {MAX_PHOTOS} photos showing{" "}
            <span className="font-medium">{taskTitle}</span> is done.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="photos">Photos</Label>
            <input
              ref={fileRef}
              id="photos"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              capture="environment"
              disabled={busy || staged.length >= MAX_PHOTOS}
              onChange={onFileChange}
              className="block w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-secondary-foreground hover:file:bg-secondary/80 disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP, or HEIC. 16 MB per photo. {staged.length}/
              {MAX_PHOTOS} added.
            </p>
          </div>

          {staged.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {staged.map((s) => (
                <div
                  key={s.id}
                  className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  {!busy && (
                    <button
                      type="button"
                      onClick={() => removeStaged(s.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeLocation}
              onChange={(e) => setIncludeLocation(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 rounded border-input"
            />
            <MapPin className="h-3.5 w-3.5" />
            Include my location (helps the admin verify)
          </label>

          {step === "uploading" && progress.total > 0 && (
            <p className="text-xs text-muted-foreground">
              Uploading {progress.done}/{progress.total}…
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || staged.length === 0}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {step === "geolocating"
                ? "Locating…"
                : step === "uploading"
                  ? "Uploading…"
                  : step === "saving"
                    ? "Saving…"
                    : `Submit ${staged.length} photo${staged.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
