import { z } from "zod";

// Single emoji or empty.
const emoji = z
  .string()
  .trim()
  .max(8) // some emoji like flags are multi-codepoint
  .optional()
  .or(z.literal("").transform(() => undefined));

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex like #f97316")
  .optional()
  .or(z.literal("").transform(() => undefined));

const hhmm = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  avatarColor: hexColor,
  avatarEmoji: emoji,
  quietHoursStart: hhmm,
  quietHoursEnd: hhmm,
});

export const addCommentSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().trim().min(1, "Say something").max(1000),
});

// Toggle a reaction on a comment. Allowed emoji set is enforced here so
// the UI can't store arbitrary strings.
const ALLOWED_REACTIONS = ["👍", "❤️", "🎉", "🔥", "🚀", "🤔"] as const;
export const toggleReactionSchema = z.object({
  commentId: z.string().min(1),
  emoji: z.enum(ALLOWED_REACTIONS),
});
export const REACTION_EMOJI = ALLOWED_REACTIONS;

export const deleteCommentSchema = z.object({
  id: z.string().min(1),
});

// Used by users to change their own password from /profile.
export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(128),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });
