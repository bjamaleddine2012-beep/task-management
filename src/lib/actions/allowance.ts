"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
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
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Not authenticated" };
  if (session.user.role !== "ADMIN") {
    return { ok: false as const, error: "Admin access required" };
  }
  return { ok: true as const, session };
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

  await prisma.allowanceEntry.create({
    data: {
      userId: parsed.data.userId,
      amountCents: cents,
      reason: parsed.data.reason,
      createdById: gate.session.user.id,
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

  await prisma.allowanceEntry.delete({ where: { id: parsed.data.id } });
  revalidatePath("/admin/allowance");
  revalidatePath("/profile");
  return { ok: true };
}
