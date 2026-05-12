"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, ExternalLink, Loader2, MapPin, X } from "lucide-react";
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
import {
  CommentThread,
  type CommentItem,
} from "@/app/_components/comment-thread";
import { SubtaskChecklist } from "@/app/_components/subtask-checklist";

const PRIORITY_VARIANT: Record<
  TaskPriority,
  "destructive" | "warning" | "secondary"
> = {
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
};

export type ReviewQueueImage = {
  id: string;
  url: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
};

export type ReviewQueueTask = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDateFormatted: string;
  proofSubmittedFormatted: string | null;
  proofImages: ReviewQueueImage[];
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  assignedTo: { name: string | null; email: string };
  // For tasks created from a template: photos from the most recent completed
  // instance, so the admin can spot regressions or verify consistency.
  previousProofImages: Array<{ url: string }>;
  aiVerdict: "match" | "mismatch" | "uncertain" | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
  comments: CommentItem[];
};

export function ReviewQueue({
  tasks,
  currentUserId,
}: {
  tasks: ReviewQueueTask[];
  currentUserId: string;
}) {
  const [reviewing, setReviewing] = React.useState<ReviewQueueTask | null>(
    null,
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((t) => {
          const cover = t.proofImages[0];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setReviewing(t)}
              className="group overflow-hidden rounded-lg border bg-background text-left transition-shadow hover:shadow-md"
            >
              {cover ? (
                <div className="relative aspect-video bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover.url}
                    alt={`Proof for ${t.title}`}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  {t.proofImages.length > 1 && (
                    <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
                      +{t.proofImages.length - 1}
                    </div>
                  )}
                  {cover.latitude !== null && cover.longitude !== null && (
                    <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
                      <MapPin className="h-3 w-3" />
                      Geo-tagged
                    </div>
                  )}
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
                    ` · ${t.proofSubmittedFormatted}`}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <ReviewDialog
        task={reviewing}
        currentUserId={currentUserId}
        onClose={() => setReviewing(null)}
      />
    </>
  );
}

function ReviewDialog({
  task,
  currentUserId,
  onClose,
}: {
  task: ReviewQueueTask | null;
  currentUserId: string;
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

  const subtaskProgress = task
    ? `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length}`
    : "";

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
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

            {task.subtasks.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Checklist · {subtaskProgress}
                </p>
                <SubtaskChecklist subtasks={task.subtasks} readOnly />
              </div>
            )}

            <PhotoGallery images={task.proofImages} />

            {task.aiVerdict && (
              <div
                className={
                  "rounded-md border p-3 text-sm " +
                  (task.aiVerdict === "match"
                    ? "border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"
                    : task.aiVerdict === "mismatch"
                      ? "border-destructive/40 bg-destructive/5 text-destructive"
                      : "border-amber-300/60 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200")
                }
              >
                <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                  AI hint · {task.aiVerdict}
                  {task.aiConfidence != null && (
                    <span className="opacity-70">
                      {task.aiConfidence}% confident
                    </span>
                  )}
                </div>
                {task.aiReasoning && (
                  <p className="text-xs">{task.aiReasoning}</p>
                )}
                <p className="mt-1 text-[10px] opacity-60">
                  Hint only — your decision still applies.
                </p>
              </div>
            )}

            {task.previousProofImages.length > 0 && (
              <details className="rounded-md border bg-muted/20 p-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Compare with last completed instance ·{" "}
                  {task.previousProofImages.length} photo
                  {task.previousProofImages.length === 1 ? "" : "s"}
                </summary>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {task.previousProofImages.map((img, i) => (
                    <a
                      key={i}
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-square overflow-hidden rounded border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt=""
                        className="h-full w-full object-cover opacity-90 transition hover:opacity-100"
                      />
                    </a>
                  ))}
                </div>
              </details>
            )}

            <div className="rounded-md border bg-muted/20 p-3">
              <CommentThread
                taskId={task.id}
                comments={task.comments}
                currentUserId={currentUserId}
                isCurrentUserAdmin={true}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="review-note">
                Note{" "}
                <span className="text-muted-foreground">
                  (required for reject)
                </span>
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

function PhotoGallery({ images }: { images: ReviewQueueImage[] }) {
  const [active, setActive] = React.useState(0);
  const current = images[active];

  if (!current) return null;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border bg-black/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={`Proof ${active + 1} of ${images.length}`}
          className="max-h-[55vh] w-full object-contain"
        />
        {current.latitude !== null && current.longitude !== null && (
          <a
            href={`https://www.google.com/maps?q=${current.latitude},${current.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/85"
          >
            <MapPin className="h-3.5 w-3.5" />
            {current.latitude.toFixed(5)}, {current.longitude.toFixed(5)}
            {current.accuracyMeters && ` · ±${current.accuracyMeters}m`}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {images.length > 1 && (
          <div className="absolute right-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
            {active + 1} / {images.length}
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="grid grid-cols-6 gap-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              className={
                "aspect-square overflow-hidden rounded-md border-2 transition-colors " +
                (i === active ? "border-primary" : "border-transparent")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
