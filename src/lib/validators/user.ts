import { z } from "zod";
import { FamilyRole } from "@prisma/client";

const passwordRule = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

// `role` here is the new family role (ADMIN / MEMBER). The legacy
// User.role enum (ADMIN / USER) is no longer set from the admin UI; we
// just keep it around in the DB for compatibility with older code.
export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name is too long"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email"),
  password: passwordRule,
  role: z.nativeEnum(FamilyRole),
});

export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name is too long")
    .optional(),
  role: z.nativeEnum(FamilyRole).optional(),
});

export const resetPasswordSchema = z.object({
  id: z.string().min(1),
  password: passwordRule,
});

export const deleteUserSchema = z.object({
  id: z.string().min(1),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
