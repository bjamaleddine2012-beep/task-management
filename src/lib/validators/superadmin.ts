import { z } from "zod";
import { FamilyRole } from "@prisma/client";

const passwordRule = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .optional()
  .or(z.literal("").transform(() => undefined));

// One member inside a provision request. Password is optional — when
// omitted the server auto-generates a strong one.
export const provisionMemberSchema = z.object({
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
  role: z.nativeEnum(FamilyRole),
  password: passwordRule,
});

// Full payload: family name + ≥1 member, with at least one of them an
// ADMIN, and no duplicate emails within the same family.
export const provisionFamilySchema = z
  .object({
    familyName: z
      .string()
      .trim()
      .min(1, "Family name is required")
      .max(80, "Family name is too long"),
    members: z
      .array(provisionMemberSchema)
      .min(1, "Add at least one member"),
  })
  .refine(
    (data) => data.members.some((m) => m.role === "ADMIN"),
    {
      message: "At least one member must be ADMIN.",
      path: ["members"],
    },
  )
  .refine(
    (data) => {
      const lower = data.members.map((m) => m.email.toLowerCase());
      return new Set(lower).size === lower.length;
    },
    {
      message: "Each email can only appear once in the same family.",
      path: ["members"],
    },
  );

export const deleteFamilySchema = z.object({
  familyId: z.string().min(1),
});

export const renameFamilySchema = z.object({
  familyId: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1, "Family name is required")
    .max(80, "Family name is too long"),
});

// Adding ONE member to an existing family. Mirrors provisionMemberSchema
// but lifted into its own schema so the form data shape matches.
export const addMemberSchema = z.object({
  familyId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.nativeEnum(FamilyRole),
  password: passwordRule,
});

export const updateMemberSchema = z.object({
  familyId: z.string().min(1),
  userId: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name is too long")
    .optional(),
  role: z.nativeEnum(FamilyRole).optional(),
});

export const removeMemberSchema = z.object({
  familyId: z.string().min(1),
  userId: z.string().min(1),
});

export const resetMemberPasswordSchema = z.object({
  familyId: z.string().min(1),
  userId: z.string().min(1),
});

export type ProvisionMemberInput = z.infer<typeof provisionMemberSchema>;
export type ProvisionFamilyInput = z.infer<typeof provisionFamilySchema>;
