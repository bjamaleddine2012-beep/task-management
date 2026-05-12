"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  addCommentSchema,
  changeOwnPasswordSchema,
  deleteCommentSchema,
  toggleReactionSchema,
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

  // Notification strategy:
  // 1. Parse @mentions out of the body. Any matching family member gets
  //    a *targeted* push and is the only person we notify.
  // 2. If no mentions, fall back to the broadcast rule (assignee →
  //    admins, admin → assignee).
  const mentioned = await resolveMentions(parsed.data.body, session.user.id);

  const preview =
    parsed.data.body.length > 60
      ? parsed.data.body.slice(0, 60) + "…"
      : parsed.data.body;
  const authorName = session.user.name ?? session.user.email;

  if (mentioned.length > 0) {
    await Promise.all(
      mentioned.map((u) =>
        notifyUser(u.id, {
          title: `${authorName} mentioned you on "${task.title}"`,
          body: preview,
          url: u.role === "ADMIN" ? "/admin/tasks" : "/",
          tag: `mention:${task.id}:${u.id}`,
        }),
      ),
    );
  } else {
    const authorIsAssignee = task.assignedToId === session.user.id;
    if (authorIsAssignee) {
      void notifyAdmins({
        title: `New comment on "${task.title}"`,
        body: `${authorName}: ${preview}`,
        url: "/admin/tasks",
        tag: `comment:${task.id}`,
      });
    } else {
      void notifyUser(task.assignedToId, {
        title: `New comment on "${task.title}"`,
        body: `${authorName}: ${preview}`,
        url: "/",
        tag: `comment:${task.id}`,
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/admin/tasks");
  return { ok: true };
}

// Parse "@name" patterns out of a comment body and return the matching
// users. Tries first-token-of-name first, then full name, then email
// local-part. Excludes the author so people don't self-mention.
async function resolveMentions(
  body: string,
  authorId: string,
): Promise<Array<{ id: string; name: string | null; role: "ADMIN" | "USER" }>> {
  // Up to 10 mentions per comment — anything beyond is spammy.
  const tokens = Array.from(body.matchAll(/@([A-Za-z0-9_.-]+)/g))
    .map((m) => m[1].toLowerCase())
    .slice(0, 10);
  if (tokens.length === 0) return [];

  // Pull all users (the family scale is small enough; no need to be cute).
  const users = await prisma.user.findMany({
    where: { id: { not: authorId } },
    select: { id: true, name: true, email: true, role: true },
  });

  const matched = new Map<string, { id: string; name: string | null; role: "ADMIN" | "USER" }>();
  for (const tok of tokens) {
    for (const u of users) {
      const firstName = (u.name ?? "").trim().split(/\s+/)[0]?.toLowerCase();
      const fullName = (u.name ?? "").trim().toLowerCase().replace(/\s+/g, "");
      const emailLocal = u.email.split("@")[0].toLowerCase();
      if (firstName === tok || fullName === tok || emailLocal === tok) {
        matched.set(u.id, { id: u.id, name: u.name, role: u.role });
      }
    }
  }
  return Array.from(matched.values());
}

// ─── Toggle a reaction on a comment ─────────────────────────────────────────

export async function toggleReactionAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = toggleReactionSchema.safeParse({
    commentId: formData.get("commentId"),
    emoji: formData.get("emoji"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid reaction." };
  }

  // Permission: must be able to see the comment (i.e. own the task or
  // be admin). Reuse the same gate as addComment.
  const comment = await prisma.taskComment.findUnique({
    where: { id: parsed.data.commentId },
    select: { task: { select: { assignedToId: true } } },
  });
  if (!comment) return { ok: false, error: "Comment not found." };
  if (
    comment.task.assignedToId !== session.user.id &&
    session.user.role !== "ADMIN"
  ) {
    return { ok: false, error: "Not allowed." };
  }

  const existing = await prisma.commentReaction.findUnique({
    where: {
      commentId_userId_emoji: {
        commentId: parsed.data.commentId,
        userId: session.user.id,
        emoji: parsed.data.emoji,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.commentReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.commentReaction.create({
      data: {
        commentId: parsed.data.commentId,
        userId: session.user.id,
        emoji: parsed.data.emoji,
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/admin/tasks");
  return { ok: true };
}

// ─── Change own password ────────────────────────────────────────────────────

export async function changeOwnPasswordAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = changeOwnPasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please fix the errors.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) return { ok: false, error: "User not found." };

  // Users who only ever signed in via Google have no password hash. They
  // can set one here without the current-password check.
  if (user.passwordHash) {
    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) {
      return {
        ok: false,
        error: "Current password is wrong.",
        fieldErrors: { currentPassword: ["Wrong password"] },
      };
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash },
  });

  revalidatePath("/profile");
  return {
    ok: true,
    message: user.passwordHash
      ? "Password changed."
      : "Password set. You can now sign in with email + password.",
  };
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
