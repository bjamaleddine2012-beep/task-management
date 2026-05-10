"use client";

import * as React from "react";
import { upload } from "@vercel/blob/client";
import { Camera, Loader2, RefreshCw } from "lucide-react";

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
const MAX_BYTES = 16 * 1024 * 1024; // 16 MB — big enough for HEIC originals

type Step = "idle" | "uploading" | "saving";

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
  const [preview, setPreview] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Revoke preview blob URL when it changes / unmounts.
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setStep("idle");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
    setError(null);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pick a photo first.");
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      setError("Photo must be JPEG, PNG, WebP, or HEIC.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Photo is too large (16 MB max).");
      return;
    }

    setError(null);

    try {
      // 1. Upload directly to Vercel Blob.
      setStep("uploading");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const blob = await upload(
        `task-proofs/${taskId}/${Date.now()}.${ext}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          contentType: file.type,
        },
      );

      // 2. Tell the server the URL so it can mark the task SUBMITTED.
      setStep("saving");
      const fd = new FormData();
      fd.set("id", taskId);
      fd.set("proofUrl", blob.url);
      const result = await submitProofAction(null, fd);

      if (result && !result.ok) {
        setError(result.error);
        setStep("idle");
        return;
      }

      // Success.
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
            Upload a photo showing{" "}
            <span className="font-medium">{taskTitle}</span> is done. An admin
            will approve or reject it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="photo">Photo</Label>
            <input
              ref={fileRef}
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              required
              disabled={busy}
              onChange={onFileChange}
              className="block w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-secondary-foreground hover:file:bg-secondary/80 disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP, or HEIC. 16 MB max.
            </p>
          </div>

          {preview && (
            <div className="overflow-hidden rounded-lg border bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Preview"
                className="max-h-72 w-full object-contain"
              />
            </div>
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
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {step === "uploading"
                ? "Uploading…"
                : step === "saving"
                  ? "Saving…"
                  : "Submit for review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
