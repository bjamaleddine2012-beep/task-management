import { z } from "zod";
import { FamilyRole } from "@prisma/client";

export const createFamilySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Family name is required")
    .max(80, "Family name is too long"),
});

export const createInviteSchema = z.object({
  role: z.nativeEnum(FamilyRole).default("MEMBER"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const acceptInviteSchema = z.object({
  token: z
    .string()
    .min(8, "Invite token is invalid")
    .max(128),
});

export const removeMemberSchema = z.object({
  userId: z.string().min(1),
});

export const switchFamilySchema = z.object({
  familyId: z.string().min(1),
});

export const revokeInviteSchema = z.object({
  id: z.string().min(1),
});
