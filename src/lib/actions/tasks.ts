"use server";

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createTaskSchema,
  deleteTaskSchema,
  setTaskStatusSchema,
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
  if (
    task.assignedToId !== gate.session.user.id &&
    gate.session.user.role !== "ADMIN"
  ) {
    return { ok: false, error: "You can't update someone else's task." };
  }

  await prisma.task.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });

  revalidatePath("/");
  revalidatePath("/admin/tasks");
  return { ok: true };
}
