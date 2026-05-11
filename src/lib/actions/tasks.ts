"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { reviewProofWithAi } from "@/lib/ai-review";
import { notifyAdmins, notifyUser } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import {
  approveProofSchema,
  createTaskSchema,
  deleteTaskSchema,
  rejectProofSchema,
  setTaskStatusSchema,
  submitProofSchema,
  subtaskCreateSchema,
  subtaskDeleteSchema,
  subtaskToggleSchema,
  updateTaskSchema,
} from "@/lib/validators/task";

export type TaskActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null;

// Discriminated-union with `ok` for unambiguous narrowing.
// Use the directly-exported `Session` type instead of inferring from `auth`,
// which has overloaded signatures that confuse `ReturnType`.
type SessionGate =
  | { ok: false; error: string }
  | { ok: true; session: Session };

async function requireSession(): Promise<SessionGate> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };
  return { ok: true, session };
}

async function requireAdmin(): Promise<SessionGate> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };
  if (session.user.role !== "ADMIN") {
    return { ok: false, error: "Admin access required" };
  }
  return { ok: true, session };
}

function flattenZodErrors<T extends Record<string, unknown>>(
  error: import("zod").ZodError<T>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_root";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

// ─── Admin: create task and assign to a user ───────────────────────────────

export async function createTaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  // Subtasks come as a single newline-separated textarea; parse here.
  const subtasksRaw = (formData.get("subtasks") as string | null) ?? "";
  const subtasks = subtasksRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const parsed = createTaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    dueDate: formData.get("dueDate"),
    priority: formData.get("priority"),
    assignedToId: formData.get("assignedToId"),
    subtasks,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const {
    title,
    description,
    dueDate,
    priority,
    assignedToId,
    subtasks: items,
  } = parsed.data;

  // Make sure the assignee actually exists.
  const assignee = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { id: true },
  });
  if (!assignee) {
    return {
      ok: false,
      error: "Selected user not found.",
      fieldErrors: { assignedToId: ["User not found"] },
    };
  }

  const created = await prisma.task.create({
    data: {
      title,
      description,
      dueDate,
      priority,
      assignedToId,
      createdById: gate.session.user.id,
      subtasks:
        items.length > 0
          ? {
              create: items.map((title, i) => ({
                title,
                position: i,
              })),
            }
          : undefined,
    },
  });

  // Notify the assignee. Fire-and-forget — if push isn't set up or the
  // user has no subscriptions, this no-ops silently.
  void notifyUser(assignedToId, {
    title: "New task assigned",
    body: title,
    url: "/",
    tag: `task:${created.id}`,
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, message: "Task created." };
}

// ─── Admin: update any task ────────────────────────────────────────────────

export async function updateTaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = updateTaskSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title") || undefined,
    description: formData.get("description") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    priority: formData.get("priority") || undefined,
    status: formData.get("status") || undefined,
    assignedToId: formData.get("assignedToId") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { id, ...rest } = parsed.data;
  await prisma.task.update({ where: { id }, data: rest });

  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return { ok: true, message: "Task updated." };
}

// ─── Admin: delete task ────────────────────────────────────────────────────

export async function deleteTaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = deleteTaskSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid task id." };

  await prisma.task.delete({ where: { id: parsed.data.id } });

  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return { ok: true, message: "Task deleted." };
}

// ─── User: change status of a task assigned to me ──────────────────────────
//
// Users can only flip between PENDING and IN_PROGRESS. To mark something
// COMPLETED they must upload proof (submitProofAction → admin approves).

export async function setMyTaskStatusAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = setTaskStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const task = await prisma.task.findUnique({
    where: { id: parsed.data.id },
    select: { assignedToId: true },
  });
  if (!task) return { ok: false, error: "Task not found." };
  const isMine = task.assignedToId === gate.session.user.id;
  const isAdmin = gate.session.user.role === "ADMIN";
  if (!isMine && !isAdmin) {
    return { ok: false, error: "You can't update someone else's task." };
  }

  // Non-admins can't self-mark as COMPLETED — they must submit proof.
  if (
    !isAdmin &&
    (parsed.data.status === "COMPLETED" ||
      parsed.data.status === "SUBMITTED" ||
      parsed.data.status === "REJECTED")
  ) {
    return {
      ok: false,
      error: "Upload proof to mark this complete.",
    };
  }

  await prisma.task.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });

  revalidatePath("/");
  revalidatePath("/admin/tasks");
  return { ok: true };
}

// ─── User: register proof images (already uploaded directly to Blob) ───────
//
// The browser uploads each file directly to Vercel Blob via /api/blob/upload
// (bypasses the 4.5 MB serverless function body limit). Then it calls this
// action with the resulting URLs + per-photo geolocation. We re-check
// ownership here and replace any previous proof set on resubmit.

export type SubmitProofInput = {
  id: string;
  images: Array<{
    url: string;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    capturedAt?: string; // ISO string from the client
  }>;
};

export async function submitProofAction(
  input: SubmitProofInput,
): Promise<TaskActionState> {
  const gate = await requireSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = submitProofSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const task = await prisma.task.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      title: true,
      description: true,
      assignedToId: true,
      status: true,
    },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.assignedToId !== gate.session.user.id) {
    return { ok: false, error: "This task isn't assigned to you." };
  }
  if (task.status === "COMPLETED") {
    return { ok: false, error: "This task is already completed." };
  }

  // Atomic: clear old proof set, save new one, flip status.
  // AI verdict is computed AFTER the transaction so a slow / failed AI
  // call never blocks the user. Result is patched in if it arrives.
  await prisma.$transaction([
    prisma.taskProofImage.deleteMany({ where: { taskId: task.id } }),
    prisma.taskProofImage.createMany({
      data: parsed.data.images.map((img) => ({
        taskId: task.id,
        url: img.url,
        latitude: img.latitude,
        longitude: img.longitude,
        accuracyMeters: img.accuracyMeters,
        capturedAt: img.capturedAt,
      })),
    }),
    prisma.task.update({
      where: { id: task.id },
      data: {
        status: "SUBMITTED",
        proofSubmittedAt: new Date(),
        // Clear any previous review and AI verdict on resubmit.
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
        aiVerdict: null,
        aiConfidence: null,
        aiReasoning: null,
      },
    }),
  ]);

  // Notify all admins that something is awaiting review.
  void notifyAdmins({
    title: "New submission to review",
    body: task.title,
    url: "/admin/tasks",
    tag: `submit:${task.id}`,
  });

  // AI review runs AFTER the response is sent so it can't time out the
  // submission. The Vercel runtime keeps the worker alive for `after()`
  // continuations. Verdict is patched onto the task whenever it completes
  // (admin sees it on next page load). Errors are caught so they never
  // surface to the user.
  const taskId = task.id;
  const taskTitle = task.title;
  const taskDescription = task.description;
  const imageUrls = parsed.data.images.map((i) => i.url);
  after(async () => {
    try {
      const verdict = await reviewProofWithAi({
        taskTitle,
        taskDescription,
        imageUrls,
      });
      if (!verdict) return;
      await prisma.task.update({
        where: { id: taskId },
        data: {
          aiVerdict: verdict.verdict,
          aiConfidence: verdict.confidence,
          aiReasoning: verdict.reasoning,
        },
      });
    } catch (err) {
      console.warn("[submitProof] AI review failed:", err);
    }
  });

  revalidatePath("/");
  revalidatePath("/admin/tasks");
  return { ok: true, message: "Submitted for review." };
}

// ─── Admin: approve a submitted proof → COMPLETED ──────────────────────────

export async function approveProofAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = approveProofSchema.safeParse({
    id: formData.get("id"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const task = await prisma.task.findUnique({
    where: { id: parsed.data.id },
    select: { status: true },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.status !== "SUBMITTED") {
    return {
      ok: false,
      error: "This task isn't waiting for review.",
    };
  }

  const updated = await prisma.task.update({
    where: { id: parsed.data.id },
    data: {
      status: "COMPLETED",
      reviewedAt: new Date(),
      reviewedById: gate.session.user.id,
      reviewNote: parsed.data.note,
    },
    select: { assignedToId: true, title: true },
  });

  void notifyUser(updated.assignedToId, {
    title: "Task approved ✓",
    body: updated.title,
    url: "/",
    tag: `review:${parsed.data.id}`,
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return { ok: true, message: "Approved." };
}

// ─── Admin: reject a submitted proof → REJECTED ────────────────────────────

export async function rejectProofAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = rejectProofSchema.safeParse({
    id: formData.get("id"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please add a reason for rejection.",
      fieldErrors: parsed.error.issues.reduce<Record<string, string[]>>(
        (acc, issue) => {
          const key = issue.path.join(".") || "_root";
          (acc[key] ??= []).push(issue.message);
          return acc;
        },
        {},
      ),
    };
  }

  const task = await prisma.task.findUnique({
    where: { id: parsed.data.id },
    select: { status: true },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.status !== "SUBMITTED") {
    return {
      ok: false,
      error: "This task isn't waiting for review.",
    };
  }

  const updated = await prisma.task.update({
    where: { id: parsed.data.id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedById: gate.session.user.id,
      reviewNote: parsed.data.note,
    },
    select: { assignedToId: true, title: true },
  });

  void notifyUser(updated.assignedToId, {
    title: "Resubmission needed",
    body: `${updated.title} — ${parsed.data.note.slice(0, 80)}`,
    url: "/",
    tag: `review:${parsed.data.id}`,
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return { ok: true, message: "Rejected." };
}

// ─── Subtasks (checklist items) ────────────────────────────────────────────

// Owner of the parent task or any admin can edit the checklist.
async function canEditSubtask(taskId: string, session: Session) {
  if (session.user.role === "ADMIN") return true;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { assignedToId: true },
  });
  return task?.assignedToId === session.user.id;
}

// Admin-only — adds a checklist item to an existing task.
export async function addSubtaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = subtaskCreateSchema.safeParse({
    taskId: formData.get("taskId"),
    title: formData.get("title"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  // Append after the highest-positioned existing subtask.
  const last = await prisma.subtask.findFirst({
    where: { taskId: parsed.data.taskId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.subtask.create({
    data: {
      taskId: parsed.data.taskId,
      title: parsed.data.title,
      position: (last?.position ?? -1) + 1,
    },
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return { ok: true };
}

// Assignee or admin — flips a checkbox on a subtask.
export async function toggleSubtaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = subtaskToggleSchema.safeParse({
    id: formData.get("id"),
    done: formData.get("done"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const subtask = await prisma.subtask.findUnique({
    where: { id: parsed.data.id },
    select: { taskId: true },
  });
  if (!subtask) return { ok: false, error: "Subtask not found." };

  const allowed = await canEditSubtask(subtask.taskId, gate.session);
  if (!allowed) return { ok: false, error: "Not allowed." };

  await prisma.subtask.update({
    where: { id: parsed.data.id },
    data: {
      done: parsed.data.done,
      doneAt: parsed.data.done ? new Date() : null,
      doneById: parsed.data.done ? gate.session.user.id : null,
    },
  });

  revalidatePath("/");
  revalidatePath("/admin/tasks");
  return { ok: true };
}

// Admin-only — deletes a checklist item.
export async function deleteSubtaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = subtaskDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  await prisma.subtask.delete({ where: { id: parsed.data.id } });
  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return { ok: true };
}
