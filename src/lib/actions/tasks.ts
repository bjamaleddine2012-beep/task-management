"use server";

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { put } from "@vercel/blob";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  approveProofSchema,
  createTaskSchema,
  deleteTaskSchema,
  rejectProofSchema,
  setTaskStatusSchema,
  submitProofSchema,
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

  const parsed = createTaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    dueDate: formData.get("dueDate"),
    priority: formData.get("priority"),
    assignedToId: formData.get("assignedToId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { title, description, dueDate, priority, assignedToId } = parsed.data;

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

  await prisma.task.create({
    data: {
      title,
      description,
      dueDate,
      priority,
      assignedToId,
      createdById: gate.session.user.id,
    },
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

// ─── User: upload proof image and submit for admin review ──────────────────

const MAX_PROOF_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_PROOF_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function submitProofAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireSession();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = submitProofSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid task." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      error: "Pick a photo of the completed work.",
      fieldErrors: { photo: ["A photo is required"] },
    };
  }
  if (!ALLOWED_PROOF_TYPES.has(file.type)) {
    return {
      ok: false,
      error: "Photo must be a JPEG, PNG, WebP, or HEIC.",
      fieldErrors: { photo: ["Unsupported file type"] },
    };
  }
  if (file.size > MAX_PROOF_BYTES) {
    return {
      ok: false,
      error: "Photo is too large (8 MB max).",
      fieldErrors: { photo: ["Too large"] },
    };
  }

  const task = await prisma.task.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
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

  // Upload to Vercel Blob. Filename is namespaced per-task so re-submissions
  // don't collide.
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const key = `task-proofs/${task.id}/${Date.now()}.${ext}`;

  let blobUrl: string;
  try {
    const blob = await put(key, file, {
      access: "public",
      addRandomSuffix: false,
    });
    blobUrl = blob.url;
  } catch (err) {
    console.error("[submitProofAction] blob upload failed:", err);
    return {
      ok: false,
      error:
        "Couldn't upload the photo. The Blob store may not be configured yet.",
    };
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: "SUBMITTED",
      proofImageUrl: blobUrl,
      proofSubmittedAt: new Date(),
      // Clear any previous review on resubmit.
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
    },
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

  await prisma.task.update({
    where: { id: parsed.data.id },
    data: {
      status: "COMPLETED",
      reviewedAt: new Date(),
      reviewedById: gate.session.user.id,
      reviewNote: parsed.data.note,
    },
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

  await prisma.task.update({
    where: { id: parsed.data.id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedById: gate.session.user.id,
      reviewNote: parsed.data.note,
    },
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return { ok: true, message: "Rejected." };
}
