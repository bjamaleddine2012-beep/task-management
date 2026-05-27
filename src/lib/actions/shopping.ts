"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { requireFamilyAdmin, requireFamilyMember } from "@/lib/family";
import { prisma } from "@/lib/prisma";
import {
  addShoppingItemSchema,
  deleteShoppingItemSchema,
  toggleShoppingItemSchema,
} from "@/lib/validators/shopping";

export type ShoppingActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null;

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

// Anyone in the active family can add to the family list.
export async function addShoppingItemAction(
  _prev: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const gate = await requireFamilyMember();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = addShoppingItemSchema.safeParse({
    name: formData.get("name"),
    quantity: formData.get("quantity") || "",
    note: formData.get("note") || "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  await prisma.shoppingItem.create({
    data: {
      name: parsed.data.name,
      quantity: parsed.data.quantity,
      note: parsed.data.note,
      addedById: gate.session.user.id,
      familyId: gate.familyId,
    },
  });

  revalidatePath("/shopping");
  return { ok: true };
}

// Toggle an item's checked state. Any family member can check/uncheck.
export async function toggleShoppingItemAction(
  _prev: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const gate = await requireFamilyMember();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = toggleShoppingItemSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  const item = await prisma.shoppingItem.findFirst({
    where: { id: parsed.data.id, familyId: gate.familyId },
    select: { checkedAt: true },
  });
  if (!item) return { ok: false, error: "Item not found." };

  await prisma.shoppingItem.updateMany({
    where: { id: parsed.data.id, familyId: gate.familyId },
    data: item.checkedAt
      ? { checkedAt: null, checkedById: null }
      : { checkedAt: new Date(), checkedById: gate.session.user.id },
  });

  revalidatePath("/shopping");
  return { ok: true };
}

// Delete: the person who added it can delete; or any family admin.
export async function deleteShoppingItemAction(
  _prev: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const gate = await requireFamilyMember();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = deleteShoppingItemSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  const item = await prisma.shoppingItem.findFirst({
    where: { id: parsed.data.id, familyId: gate.familyId },
    select: { addedById: true },
  });
  if (!item) return { ok: false, error: "Item not found." };

  if (item.addedById !== gate.session.user.id && gate.role !== "ADMIN") {
    return { ok: false, error: "Not allowed." };
  }

  await prisma.shoppingItem.deleteMany({
    where: { id: parsed.data.id, familyId: gate.familyId },
  });
  revalidatePath("/shopping");
  return { ok: true };
}

// Family-admin-only bulk clear of every checked item in this family.
export async function clearCheckedShoppingAction(): Promise<ShoppingActionState> {
  const gate = await requireFamilyAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const r = await prisma.shoppingItem.deleteMany({
    where: { familyId: gate.familyId, checkedAt: { not: null } },
  });
  revalidatePath("/shopping");
  return {
    ok: true,
    message: `Cleared ${r.count} item${r.count === 1 ? "" : "s"}.`,
  };
}
