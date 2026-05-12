"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  addCommentSchema,
  deleteCommentSchema,
  updateProfileSchema,
} from "@/lib/validators/profile";
import { notifyAdmins, notifyUser } from "@/lib/notify";

export type ProfileActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null;

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

// ─── Update own profile ─────────────────────────────────────────────────────

export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name") || undefined,
    avatarColor: formData.get("avatarColor") || "",
    avatarEmoji: formData.get("avatarEmoji") || "",
    quietHoursStart: formData.get("quietHoursStart") || "",
    quietHoursEnd: formData.get("quietHoursEnd") || "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      avatarColor: parsed.data.avatarColor ?? null,
      avatarEmoji: parsed.data.avatarEmoji ?? null,
      quietHoursStart: parsed.data.quietHoursStart ?? null,
      quietHoursEnd: parsed.data.quietHoursEnd ?? null,
    },
  });

  revalidatePath("/profile");
  revalidatePath("/");
  revalidatePath("/admin/users");
  return { ok: true, message: "Profile updated." };
}

// ─── Comments on a task ─────────────────────────────────────────────────────

export async function addCommentAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = addCommentSchema.safeParse({
    taskId: formData.get("taskId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const task = await prisma.task.findUnique({
    where: { id: parsed.data.taskId },
    select: {
      id: true,
      title: true,
      assignedToId: true,
    },
  });
  if (!task) return { ok: false, error: "Task not found." };

  // Permission: assignee or admin only.
  if (
    task.assignedToId !== session.user.id &&
    session.user.role !== "ADMIN"
  ) {
    return { ok: false, error: "You can't comment on this task." };
  }

  await prisma.taskComment.create({
    data: {
      taskId: parsed.data.taskId,
      userId: session.user.id,
      body: parsed.data.body,
    },
  });

  // Notify the other side. If a user commented, notify all admins; if an
  // admin commented, notify the assignee.
  const authorIsAssignee = task.assignedToId === session.user.id;
  const preview =
    parsed.data.body.length > 60
      ? parsed.data.body.slice(0, 60) + "…"
      : parsed.data.body;

  if (authorIsAssignee) {
    void notifyAdmins({
      title: `New comment on "${task.title}"`,
      body: `${session.user.name ?? session.user.email}: ${preview}`,
      url: "/admin/tasks",
      tag: `comment:${task.id}`,
    });
  } else {
    void notifyUser(task.assignedToId, {
      title: `New comment on "${task.title}"`,
      body: `${session.user.name ?? "Admin"}: ${preview}`,
      url: "/",
      tag: `comment:${task.id}`,
    });
  }

  revalidatePath("/");
  revalidatePath("/admin/tasks");
  return { ok: true };
}

export async function deleteCommentAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = deleteCommentSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  const comment = await prisma.taskComment.findUnique({
    where: { id: parsed.data.id },
    select: { userId: true },
  });
  if (!comment) return { ok: false, error: "Comment not found." };

  // Author or any admin can delete.
  if (
    comment.userId !== session.user.id &&
    session.user.role !== "ADMIN"
  ) {
    return { ok: false, error: "Not allowed." };
  }

  await prisma.taskComment.delete({ where: { id: parsed.data.id } });
  revalidatePath("/");
  revalidatePath("/admin/tasks");
  return { ok: true };
}
