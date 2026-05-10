import { z } from "zod";
import { TaskPriority } from "@prisma/client";

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  priority: z.nativeEnum(TaskPriority),
  defaultAssigneeId: z.string().optional().nullable(),
  // Newline-separated; same shape as createTaskSchema.
  subtasks: z.string().optional(),
  // Recurrence: 0 = manual, otherwise interval in days.
  intervalDays: z
    .union([z.literal(""), z.string().regex(/^\d+$/)])
    .optional()
    .transform((v) => (v && v !== "" ? Number(v) : 0)),
  // Hour 0-23 for the daily spawn target (used to set dueDate).
  dueHourLocal: z
    .union([z.literal(""), z.string().regex(/^\d+$/)])
    .optional()
    .transform((v) => {
      const n = v && v !== "" ? Number(v) : 17;
      return Math.max(0, Math.min(23, n));
    }),
  active: z
    .union([z.literal("on"), z.literal(""), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on"),
});

export const updateTemplateSchema = createTemplateSchema.extend({
  id: z.string().min(1),
});

export const deleteTemplateSchema = z.object({
  id: z.string().min(1),
});

export const spawnFromTemplateSchema = z.object({
  id: z.string().min(1),
  // Optional: override assignee at spawn time.
  assignedToId: z.string().optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
