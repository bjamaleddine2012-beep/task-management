import { z } from "zod";
import { TaskPriority, TaskStatus } from "@prisma/client";

// Accepts either YYYY-MM-DD or YYYY-MM-DDTHH:mm (datetime-local input).
const dueDateString = z
  .string()
  .min(1, "Due date is required")
  .transform((s, ctx) => {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date",
      });
      return z.NEVER;
    }
    return d;
  });

export const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(120, "Title is too long"),
  description: z
    .string()
    .trim()
    .max(2000, "Description is too long")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  dueDate: dueDateString,
  priority: z.nativeEnum(TaskPriority),
  assignedToId: z.string().min(1, "Assignee is required"),
  // Optional checklist items; the form passes a newline-delimited string
  // and we split on the server.
  subtasks: z
    .array(z.string().trim().min(1).max(200))
    .max(50, "Up to 50 subtasks per task")
    .optional()
    .default([]),
  pointsValue: z
    .union([z.literal(""), z.string().regex(/^\d+$/)])
    .optional()
    .transform((v) => {
      const n = v && v !== "" ? Number(v) : 10;
      return Math.max(0, Math.min(1000, n));
    }),
});

export const updateTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  dueDate: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s) return undefined;
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid date",
        });
        return z.NEVER;
      }
      return d;
    }),
  priority: z.nativeEnum(TaskPriority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  assignedToId: z.string().optional(),
});

// User submits proof for review. Status moves to SUBMITTED.
// Allowed only when current status is PENDING / IN_PROGRESS / REJECTED.
//
// Each image's `url` is what Vercel Blob returned after a client-direct
// upload. The server validates the host so we don't save arbitrary URLs.
const proofImageSchema = z.object({
  url: z
    .string()
    .url("Upload didn't complete — try again")
    .refine(
      (u) => /\.public\.blob\.vercel-storage\.com\//.test(u),
      "Invalid upload URL",
    ),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyMeters: z.number().int().nonnegative().optional(),
  capturedAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((s) => (s ? new Date(s) : undefined)),
});

export const submitProofSchema = z.object({
  id: z.string().min(1),
  images: z
    .array(proofImageSchema)
    .min(1, "At least one photo is required")
    .max(10, "Up to 10 photos per submission"),
});

// Subtask schemas
export const subtaskCreateSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().trim().min(1, "Required").max(200),
});

export const subtaskToggleSchema = z.object({
  id: z.string().min(1),
  done: z.union([z.boolean(), z.literal("true"), z.literal("false")]).transform(
    (v) => (typeof v === "boolean" ? v : v === "true"),
  ),
});

export const subtaskDeleteSchema = z.object({
  id: z.string().min(1),
});

// Admin approves submitted proof → COMPLETED.
export const approveProofSchema = z.object({
  id: z.string().min(1),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// Admin rejects submitted proof → REJECTED. Note required (gives user
// a reason to act on).
export const rejectProofSchema = z.object({
  id: z.string().min(1),
  note: z
    .string()
    .trim()
    .min(1, "Tell the user why so they can fix it")
    .max(500),
});

export const deleteTaskSchema = z.object({
  id: z.string().min(1),
});

export const setTaskStatusSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(TaskStatus),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
