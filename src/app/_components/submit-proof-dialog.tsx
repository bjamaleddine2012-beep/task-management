"use client";

import * as React from "react";
import { useActionState } from "react";
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
import {
  submitProofAction,
  type TaskActionState,
} from "@/lib/actions/tasks";

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
  const [state, action, pending] = useActionState<TaskActionState, FormData>(
    submitProofAction,
    null,
  );
  const [preview, setPreview] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      formRef.current?.reset();
      setPreview(null);
    }
  }, [state]);

  // Revoke preview blob URL when component unmounts or preview changes.
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            Upload a photo showing <span className="font-medium">{taskTitle}</span>{" "}
            is done. An admin will approve or reject it.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={action} className="space-y-4">
          <input type="hidden" name="id" value={taskId} />

          <div className="space-y-1.5">
            <Label htmlFor="photo">Photo</Label>
            {/* `capture="environment"` prompts the rear camera on mobile. */}
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              required
              onChange={onFileChange}
              className="block w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-secondary-foreground hover:file:bg-secondary/80"
            />
            {fieldError("photo") && (
              <p className="text-xs text-destructive">{fieldError("photo")}</p>
            )}
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP, or HEIC. 8 MB max.
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

          {state && !state.ok && !state.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Submit for review
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
