"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { requireFamilyAdmin } from "@/lib/family";
import { prisma } from "@/lib/prisma";
import {
  addAllowanceSchema,
  deleteAllowanceSchema,
  dollarsToCents,
} from "@/lib/validators/allowance";
import { notifyUser } from "@/lib/notify";

export type AllowanceActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null;

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

// Admin adds a ledger entry. Positive = the kid earned $X; negative =
// the kid was paid out $X (allowance goes back down). The user is
// notified so they see their balance change.
export async function addAllowanceAction(
  _prev: AllowanceActionState,
  formData: FormData,
): Promise<AllowanceActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = addAllowanceSchema.safeParse({
    userId: formData.get("userId"),
    amountDollars: formData.get("amountDollars"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please fix the errors.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const cents = dollarsToCents(parsed.data.amountDollars);
  if (cents === 0) return { ok: false, error: "Amount can't be zero." };

  // Target user must be a member of the admin's active family.
  const member = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: { familyId: gate.familyId, userId: parsed.data.userId },
    },
    select: { userId: true },
  });
  if (!member) {
    return { ok: false, error: "That user is not in your family." };
  }

  await prisma.allowanceEntry.create({
    data: {
      userId: parsed.data.userId,
      amountCents: cents,
      reason: parsed.data.reason,
      createdById: gate.session.user.id,
      familyId: gate.familyId,
    },
  });

  void notifyUser(parsed.data.userId, {
    title:
      cents > 0
        ? `Allowance +$${(cents / 100).toFixed(2)}`
        : `Allowance paid out: $${Math.abs(cents / 100).toFixed(2)}`,
    body: parsed.data.reason,
    url: "/profile",
    tag: `allowance:${Date.now()}`,
  });

  revalidatePath("/admin/allowance");
  revalidatePath("/profile");
  return { ok: true, message: "Entry saved." };
}

// Admin can delete a mistaken entry.
export async function deleteAllowanceAction(
  _prev: AllowanceActionState,
  formData: FormData,
): Promise<AllowanceActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = deleteAllowanceSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  const r = await prisma.allowanceEntry.deleteMany({
    where: { id: parsed.data.id, familyId: gate.familyId },
  });
  if (r.count === 0)
    return { ok: false, error: "Entry not found in this family." };
  revalidatePath("/admin/allowance");
  revalidatePath("/profile");
  return { ok: true };
}
