"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { recordActivity } from "@/lib/activity";
import { reviewProofWithAi } from "@/lib/ai-review";
import {
  requireFamilyAdmin,
  requireFamilyMember,
} from "@/lib/family";
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
// Tenant-aware gates. ADMIN now means "admin of the active family"
// (checked via FamilyMember.role). Every read/write in this file MUST
// also filter Prisma operations by `familyId === gate.familyId`.
type FamilyAwareGate =
  | { ok: false; error: string }
  | {
      ok: true;
      session: Session;
      familyId: string;
      role: "ADMIN" | "MEMBER";
    };

async function requireSession(): Promise<FamilyAwareGate> {
  const r = await requireFamilyMember();
  return r as FamilyAwareGate;
}

async function requireAdmin(): Promise<FamilyAwareGate> {
  const r = await requireFamilyAdmin();
  return r as FamilyAwareGate;
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
    pointsValue: formData.get("pointsValue") ?? "",
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
    pointsValue,
  } = parsed.data;

  // The assignee MUST be a member of this family — otherwise we'd leak
  // a task into another tenant. Single query: matches only if they're a
  // FamilyMember of gate.familyId.
  const assignee = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: { familyId: gate.familyId, userId: assignedToId },
    },
    select: { userId: true },
  });
  if (!assignee) {
    return {
      ok: false,
      error: "Selected user is not in your family.",
      fieldErrors: { assignedToId: ["User not in family"] },
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
      familyId: gate.familyId,
      pointsValue,
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

  await recordActivity(
    created.id,
    gate.session.user.id,
    "created",
    `assigned to ${assignedToId}`,
  );

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
  // If reassigning, verify the new assignee is in this family.
  if (rest.assignedToId) {
    const m = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId: gate.familyId, userId: rest.assignedToId },
      },
      select: { userId: true },
    });
    if (!m) return { ok: false, error: "Assignee is not in this family." };
  }

  // updateMany with familyId in the where clause: returns count 0 if the
  // task belongs to another family, so we can't accidentally edit it.
  const r = await prisma.task.updateMany({
    where: { id, familyId: gate.familyId },
    data: rest,
  });
  if (r.count === 0) {
    return { ok: false, error: "Task not found in this family." };
  }

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

  const r = await prisma.task.deleteMany({
    where: { id: parsed.data.id, familyId: gate.familyId },
  });
  if (r.count === 0) {
    return { ok: false, error: "Task not found in this family." };
  }

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

  // Scope the lookup to this family — silently returns null for other families.
  const task = await prisma.task.findFirst({
    where: { id: parsed.data.id, familyId: gate.familyId },
    select: { assignedToId: true },
  });
  if (!task) return { ok: false, error: "Task not found." };
  const isMine = task.assignedToId === gate.session.user.id;
  const isAdmin = gate.role === "ADMIN";
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

  await prisma.task.updateMany({
    where: { id: parsed.data.id, familyId: gate.familyId },
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

  const task = await prisma.task.findFirst({
    where: { id: parsed.data.id, familyId: gate.familyId },
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
    prisma.task.updateMany({
      where: { id: task.id, familyId: gate.familyId },
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

  await recordActivity(
    task.id,
    gate.session.user.id,
    "submitted",
    `${parsed.data.images.length} photo${parsed.data.images.length === 1 ? "" : "s"}`,
  );

  // Notify admins of this family — never cross-tenant.
  void notifyAdmins(gate.familyId, {
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
      // Re-scoped by familyId. The closure captures gate.familyId from
      // the surrounding action so we can't accidentally patch another
      // family's task.
      await prisma.task.updateMany({
        where: { id: taskId, familyId: gate.familyId },
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

  const task = await prisma.task.findFirst({
    where: { id: parsed.data.id, familyId: gate.familyId },
    select: { status: true },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.status !== "SUBMITTED") {
    return {
      ok: false,
      error: "This task isn't waiting for review.",
    };
  }

  // Atomic: flip status + credit points to assignee.
  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.task.update({
      where: { id: parsed.data.id },
      data: {
        status: "COMPLETED",
        reviewedAt: new Date(),
        reviewedById: gate.session.user.id,
        reviewNote: parsed.data.note,
      },
      select: { assignedToId: true, title: true, pointsValue: true },
    });
    if (t.pointsValue > 0) {
      await tx.user.update({
        where: { id: t.assignedToId },
        data: { points: { increment: t.pointsValue } },
      });
    }
    return t;
  });

  await recordActivity(
    parsed.data.id,
    gate.session.user.id,
    "approved",
    `+${updated.pointsValue} pts${parsed.data.note ? ` · "${parsed.data.note.slice(0, 60)}"` : ""}`,
  );

  void notifyUser(updated.assignedToId, {
    title: `Task approved ✓ (+${updated.pointsValue} pts)`,
    body: updated.title,
    url: "/profile",
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

  const task = await prisma.task.findFirst({
    where: { id: parsed.data.id, familyId: gate.familyId },
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

  await recordActivity(
    parsed.data.id,
    gate.session.user.id,
    "rejected",
    parsed.data.note.slice(0, 200),
  );

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

// Owner of the parent task or any family admin can edit the checklist.
// Also enforces the parent task belongs to the user's active family.
async function canEditSubtask(
  taskId: string,
  session: Session,
  familyId: string,
  role: "ADMIN" | "MEMBER",
): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, familyId },
    select: { assignedToId: true },
  });
  if (!task) return false;
  if (role === "ADMIN") return true;
  return task.assignedToId === session.user.id;
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

  // Verify the parent task belongs to this family before touching subtasks.
  const parent = await prisma.task.findFirst({
    where: { id: parsed.data.taskId, familyId: gate.familyId },
    select: { id: true },
  });
  if (!parent) return { ok: false, error: "Task not found in this family." };

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

  const allowed = await canEditSubtask(
    subtask.taskId,
    gate.session,
    gate.familyId,
    gate.role,
  );
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

  // Verify the subtask's parent task is in this family.
  const subtask = await prisma.subtask.findUnique({
    where: { id: parsed.data.id },
    select: { task: { select: { familyId: true } } },
  });
  if (!subtask || subtask.task.familyId !== gate.familyId) {
    return { ok: false, error: "Subtask not found in this family." };
  }

  await prisma.subtask.delete({ where: { id: parsed.data.id } });
  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return { ok: true };
}

// ─── Admin power tools ──────────────────────────────────────────────────────

// Duplicate an existing task. Copies title/desc/priority/due/checklist/
// points but moves due date forward 1 day and resets status. The clone
// can optionally be reassigned at the same time.
export async function duplicateTaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { ok: false, error: "Invalid task id." };
  }
  const assignTo = formData.get("assignedToId");

  const src = await prisma.task.findFirst({
    where: { id, familyId: gate.familyId },
    include: {
      subtasks: { select: { title: true, position: true } },
    },
  });
  if (!src) return { ok: false, error: "Task not found in this family." };

  const due = new Date(src.dueDate);
  due.setDate(due.getDate() + 1);

  const requestedAssignee =
    typeof assignTo === "string" && assignTo ? assignTo : src.assignedToId;

  // Verify the (possibly new) assignee is in this family.
  const member = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: { familyId: gate.familyId, userId: requestedAssignee },
    },
    select: { userId: true },
  });
  if (!member) {
    return { ok: false, error: "Assignee is not in this family." };
  }
  const assignedToId = requestedAssignee;

  const dup = await prisma.task.create({
    data: {
      title: src.title,
      description: src.description,
      priority: src.priority,
      pointsValue: src.pointsValue,
      category: src.category,
      dueDate: due,
      assignedToId,
      createdById: gate.session.user.id,
      familyId: gate.familyId,
      fromTemplateId: src.fromTemplateId,
      subtasks:
        src.subtasks.length > 0
          ? {
              create: src.subtasks.map((s) => ({
                title: s.title,
                position: s.position,
              })),
            }
          : undefined,
    },
  });

  await recordActivity(
    dup.id,
    gate.session.user.id,
    "duplicated",
    `from task ${id}`,
  );

  void notifyUser(assignedToId, {
    title: "New task assigned",
    body: dup.title,
    url: "/",
    tag: `task:${dup.id}`,
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return { ok: true, message: "Task duplicated." };
}

// Bulk: delete many tasks at once.
export async function bulkDeleteTasksAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  // FormData repeated `ids` entries → string[]
  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string");
  if (ids.length === 0) return { ok: false, error: "No tasks selected." };

  // The familyId clause makes this safe even if the client submits ids
  // belonging to another tenant — those rows just won't match.
  const r = await prisma.task.deleteMany({
    where: { id: { in: ids }, familyId: gate.familyId },
  });
  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return { ok: true, message: `Deleted ${r.count} task${r.count === 1 ? "" : "s"}.` };
}

// Bulk: reassign many tasks at once to a new user.
export async function bulkReassignTasksAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string");
  const newAssigneeId = formData.get("assignedToId");
  if (ids.length === 0) return { ok: false, error: "No tasks selected." };
  if (typeof newAssigneeId !== "string" || !newAssigneeId) {
    return { ok: false, error: "Pick a user." };
  }

  // New assignee must be a family member; otherwise we'd assign a task
  // to someone outside the family.
  const assignee = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: { familyId: gate.familyId, userId: newAssigneeId },
    },
    select: { userId: true },
  });
  if (!assignee) return { ok: false, error: "Assignee is not in this family." };

  const r = await prisma.task.updateMany({
    where: { id: { in: ids }, familyId: gate.familyId },
    data: { assignedToId: newAssigneeId },
  });

  // Log each reassignment (best-effort, fire-and-forget).
  for (const id of ids) {
    void recordActivity(id, gate.session.user.id, "reassigned", `to ${newAssigneeId}`);
  }

  // Notify the new assignee once with a summary.
  if (r.count > 0) {
    void notifyUser(newAssigneeId, {
      title: `${r.count} task${r.count === 1 ? "" : "s"} reassigned to you`,
      body: "Open the app to see them",
      url: "/",
    });
  }

  revalidatePath("/admin/tasks");
  revalidatePath("/");
  return {
    ok: true,
    message: `Reassigned ${r.count} task${r.count === 1 ? "" : "s"}.`,
  };
}

// CSV export of every task — for backup or external reporting. Returns
// the raw CSV string; the client triggers a download.
export async function exportTasksCsvAction(): Promise<
  | { ok: true; csv: string; filename: string }
  | { ok: false; error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const tasks = await prisma.task.findMany({
    where: { familyId: gate.familyId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      pointsValue: true,
      category: true,
      dueDate: true,
      createdAt: true,
      reviewedAt: true,
      assignedTo: { select: { name: true, email: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  const esc = (s: unknown): string => {
    if (s == null) return "";
    const str = s instanceof Date ? s.toISOString() : String(s);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const headers = [
    "id",
    "title",
    "description",
    "priority",
    "status",
    "pointsValue",
    "category",
    "dueDate",
    "assignee",
    "assigneeEmail",
    "createdBy",
    "createdByEmail",
    "createdAt",
    "reviewedAt",
  ];

  const rows = tasks.map((t) =>
    [
      esc(t.id),
      esc(t.title),
      esc(t.description),
      esc(t.priority),
      esc(t.status),
      esc(t.pointsValue),
      esc(t.category),
      esc(t.dueDate),
      esc(t.assignedTo.name),
      esc(t.assignedTo.email),
      esc(t.createdBy.name),
      esc(t.createdBy.email),
      esc(t.createdAt),
      esc(t.reviewedAt),
    ].join(","),
  );

  const csv = [headers.join(","), ...rows].join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    csv,
    filename: `tasks-${stamp}.csv`,
  };
}
