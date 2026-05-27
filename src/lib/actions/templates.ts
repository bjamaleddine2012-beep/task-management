"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createTemplateSchema,
  deleteTemplateSchema,
  spawnFromTemplateSchema,
  updateTemplateSchema,
} from "@/lib/validators/template";

export type TemplateActionState =
  | { ok: true; message?: string; spawnedTaskId?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null;

import { requireFamilyAdmin } from "@/lib/family";

async function requireAdmin() {
  return requireFamilyAdmin();
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

const FIELDS_FROM_FORM = (formData: FormData) => ({
  name: formData.get("name"),
  title: formData.get("title"),
  description: formData.get("description"),
  priority: formData.get("priority"),
  defaultAssigneeId: formData.get("defaultAssigneeId") || null,
  subtasks: formData.get("subtasks") ?? "",
  intervalDays: formData.get("intervalDays") ?? "",
  dueHourLocal: formData.get("dueHourLocal") ?? "",
  active: formData.get("active") ?? "",
});

// ─── Create ────────────────────────────────────────────────────────────────

export async function createTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = createTemplateSchema.safeParse(FIELDS_FROM_FORM(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const data = parsed.data;
  await prisma.taskTemplate.create({
    data: {
      name: data.name,
      title: data.title,
      description: data.description,
      priority: data.priority,
      defaultAssigneeId: data.defaultAssigneeId || null,
      subtasks: data.subtasks || null,
      intervalDays: data.intervalDays > 0 ? data.intervalDays : null,
      dueHourLocal: data.dueHourLocal,
      active: data.active,
      createdById: gate.session.user.id,
      familyId: gate.familyId,
    },
  });

  revalidatePath("/admin/templates");
  return { ok: true, message: "Template created." };
}

// ─── Update ────────────────────────────────────────────────────────────────

export async function updateTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = updateTemplateSchema.safeParse({
    ...FIELDS_FROM_FORM(formData),
    id: formData.get("id"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const r = await prisma.taskTemplate.updateMany({
    where: { id: data.id, familyId: gate.familyId },
    data: {
      name: data.name,
      title: data.title,
      description: data.description,
      priority: data.priority,
      defaultAssigneeId: data.defaultAssigneeId || null,
      subtasks: data.subtasks || null,
      intervalDays: data.intervalDays > 0 ? data.intervalDays : null,
      dueHourLocal: data.dueHourLocal,
      active: data.active,
    },
  });
  if (r.count === 0)
    return { ok: false, error: "Template not found in this family." };

  revalidatePath("/admin/templates");
  return { ok: true, message: "Template updated." };
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = deleteTemplateSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  const r = await prisma.taskTemplate.deleteMany({
    where: { id: parsed.data.id, familyId: gate.familyId },
  });
  if (r.count === 0)
    return { ok: false, error: "Template not found in this family." };
  revalidatePath("/admin/templates");
  return { ok: true, message: "Template deleted." };
}

// ─── Spawn (admin manually creates a Task from a template) ─────────────────

export async function spawnFromTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = spawnFromTemplateSchema.safeParse({
    id: formData.get("id"),
    assignedToId: formData.get("assignedToId") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const tpl = await prisma.taskTemplate.findFirst({
    where: { id: parsed.data.id, familyId: gate.familyId },
  });
  if (!tpl) return { ok: false, error: "Template not found in this family." };

  const assigneeId = parsed.data.assignedToId ?? tpl.defaultAssigneeId;
  if (!assigneeId) {
    return { ok: false, error: "Pick an assignee — template has no default." };
  }

  const subtaskTitles = (tpl.subtasks ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Due date: today at the template's dueHourLocal.
  const due = new Date();
  due.setHours(tpl.dueHourLocal ?? 17, 0, 0, 0);

  // The assignee must be in this family.
  const member = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId: gate.familyId, userId: assigneeId } },
    select: { userId: true },
  });
  if (!member) {
    return { ok: false, error: "Assignee is not in this family." };
  }

  const task = await prisma.task.create({
    data: {
      title: tpl.title,
      description: tpl.description,
      priority: tpl.priority,
      dueDate: due,
      assignedToId: assigneeId,
      createdById: gate.session.user.id,
      familyId: gate.familyId,
      fromTemplateId: tpl.id,
      subtasks:
        subtaskTitles.length > 0
          ? {
              create: subtaskTitles.map((title, i) => ({
                title,
                position: i,
              })),
            }
          : undefined,
    },
  });

  revalidatePath("/admin/tasks");
  revalidatePath("/admin/templates");
  revalidatePath("/");
  return { ok: true, message: "Task created.", spawnedTaskId: task.id };
}
