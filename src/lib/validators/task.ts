import { z } from "zod";
import { TaskPriority, TaskStatus } from "@prisma/client";

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
  dueDate: z
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
    }),
  priority: z.nativeEnum(TaskPriority),
  assignedToId: z.string().min(1, "Assignee is required"),
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

export const deleteTaskSchema = z.object({
  id: z.string().min(1),
});

export const setTaskStatusSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(TaskStatus),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
