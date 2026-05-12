// Server-side helper for writing a TaskActivity row.
// Called from task server actions. Best-effort — a logging failure must
// never break the underlying action, so all calls swallow errors.

import { prisma } from "@/lib/prisma";

export type ActivityKind =
  | "created"
  | "edited"
  | "duplicated"
  | "reassigned"
  | "submitted"
  | "approved"
  | "rejected"
  | "deleted"
  | "comment"
  | "status_change";

export async function recordActivity(
  taskId: string,
  actorId: string | null,
  kind: ActivityKind,
  detail?: string | null,
): Promise<void> {
  try {
    await prisma.taskActivity.create({
      data: {
        taskId,
        actorId,
        kind,
        detail: detail ?? null,
      },
    });
  } catch (err) {
    console.warn("[activity] log failed:", (err as Error).message);
  }
}
