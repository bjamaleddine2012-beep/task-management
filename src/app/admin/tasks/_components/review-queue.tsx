"use client";

import * as React from "react";
import { useActionState } from "react";
import Image from "next/image";
import { Check, Loader2, X } from "lucide-react";
import type { TaskPriority } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  approveProofAction,
  rejectProofAction,
  type TaskActionState,
} from "@/lib/actions/tasks";

const PRIORITY_VARIANT: Record<
  TaskPriority,
  "destructive" | "warning" | "secondary"
> = {
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
};

export type ReviewQueueTask = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDateFormatted: string;
  proofImageUrl: string | null;
  proofSubmittedFormatted: string | null;
  assignedTo: { name: string | null; email: string };
};

export function ReviewQueue({ tasks }: { tasks: ReviewQueueTask[] }) {
  const [reviewing, setReviewing] = React.useState<ReviewQueueTask | null>(
    null,
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setReviewing(t)}
            className="group overflow-hidden rounded-lg border bg-background text-left transition-shadow hover:shadow-md"
          >
            {t.proofImageUrl ? (
              <div className="relative aspect-video bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.proofImageUrl}
                  alt={`Proof for ${t.title}`}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center bg-muted text-xs text-muted-foreground">
                No image
              </div>
            )}
            <div className="space-y-1 p-3">
              <div className="flex items-center gap-2">
                <p className="line-clamp-1 font-medium">{t.title}</p>
                <Badge variant={PRIORITY_VARIANT[t.priority]}>
                  {t.priority}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.assignedTo.name ?? t.assignedTo.email}
                {t.proofSubmittedFormatted &&
                  ` · submitted ${t.proofSubmittedFormatted}`}
              </p>
            </div>
          </button>
        ))}
      </div>

      <ReviewDialog
        task={reviewing}
        onClose={() => setReviewing(null)}
      />
    </>
  );
}

function ReviewDialog({
  task,
  onClose,
}: {
  task: ReviewQueueTask | null;
  onClose: () => void;
}) {
  const [approveState, approveAction, approving] = useActionState<
    TaskActionState,
    FormData
  >(approveProofAction, null);
  const [rejectState, rejectAction, rejecting] = useActionState<
    TaskActionState,
    FormData
  >(rejectProofAction, null);

  React.useEffect(() => {
    if (approveState?.ok || rejectState?.ok) onClose();
  }, [approveState, rejectState, onClose]);

  const error =
    (approveState && !approveState.ok && approveState.error) ||
    (rejectState && !rejectState.ok && rejectState.error) ||
    null;

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review submission</DialogTitle>
          <DialogDescription>
            {task && (
              <>
                <span className="font-medium">{task.title}</span> ·{" "}
                {task.assignedTo.name ?? task.assignedTo.email} · due{" "}
                {task.dueDateFormatted}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {task && (
          <div className="space-y-4">
            {task.description && (
              <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                {task.description}
              </p>
            )}

            {task.proofImageUrl && (
              <div className="relative overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={task.proofImageUrl}
                  alt="Proof of completion"
                  className="max-h-[60vh] w-full object-contain bg-black/5"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="review-note">
                Note <span className="text-muted-foreground">(required for reject)</span>
              </Label>
              <textarea
                id="review-note"
                form="reject-form"
                name="note"
                rows={2}
                placeholder="Add a comment for the assignee"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <DialogFooter className="gap-2">
              {/* Reject form gets the note input via the `form` attribute above. */}
              <form id="reject-form" action={rejectAction}>
                <input type="hidden" name="id" value={task.id} />
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={approving || rejecting}
                >
                  {rejecting ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <X className="mr-1 h-4 w-4" />
                  )}
                  Reject
                </Button>
              </form>
              <form action={approveAction}>
                <input type="hidden" name="id" value={task.id} />
                <Button type="submit" disabled={approving || rejecting}>
                  {approving ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-4 w-4" />
                  )}
                  Approve
                </Button>
              </form>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Image is imported only to keep next/image available if you swap later.
// Currently using <img> because Vercel Blob URLs aren't pre-known to next.config.
void Image;
