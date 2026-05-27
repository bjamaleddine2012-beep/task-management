import { z } from "zod";

// Family-provisioning payload (super-admin only).
//
// `password` is optional — when omitted, the server generates a strong
// 14-char temporary password automatically. When provided, must satisfy
// the same length rules as our other password fields.
export const provisionFamilySchema = z.object({
  familyName: z
    .string()
    .trim()
    .min(1, "Family name is required")
    .max(80, "Family name is too long"),
  adminName: z
    .string()
    .trim()
    .min(1, "Admin name is required")
    .max(80, "Admin name is too long"),
  adminEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email"),
  // Optional override; when blank we auto-generate.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type ProvisionFamilyInput = z.infer<typeof provisionFamilySchema>;
