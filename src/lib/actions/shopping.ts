"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
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

// Anyone signed in can add to the family list.
export async function addShoppingItemAction(
  _prev: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

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
      addedById: session.user.id,
    },
  });

  revalidatePath("/shopping");
  return { ok: true };
}

// Toggle an item's checked state. Anyone signed in can check/uncheck.
export async function toggleShoppingItemAction(
  _prev: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = toggleShoppingItemSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  const item = await prisma.shoppingItem.findUnique({
    where: { id: parsed.data.id },
    select: { checkedAt: true },
  });
  if (!item) return { ok: false, error: "Item not found." };

  await prisma.shoppingItem.update({
    where: { id: parsed.data.id },
    data: item.checkedAt
      ? { checkedAt: null, checkedById: null }
      : { checkedAt: new Date(), checkedById: session.user.id },
  });

  revalidatePath("/shopping");
  return { ok: true };
}

// Delete: the person who added an item can delete it, and any admin can.
export async function deleteShoppingItemAction(
  _prev: ShoppingActionState,
  formData: FormData,
): Promise<ShoppingActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = deleteShoppingItemSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  const item = await prisma.shoppingItem.findUnique({
    where: { id: parsed.data.id },
    select: { addedById: true },
  });
  if (!item) return { ok: false, error: "Item not found." };

  if (item.addedById !== session.user.id && session.user.role !== "ADMIN") {
    return { ok: false, error: "Not allowed." };
  }

  await prisma.shoppingItem.delete({ where: { id: parsed.data.id } });
  revalidatePath("/shopping");
  return { ok: true };
}

// Admin-only bulk clear of every checked item. After a shop trip.
export async function clearCheckedShoppingAction(): Promise<ShoppingActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };
  if (session.user.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const r = await prisma.shoppingItem.deleteMany({
    where: { checkedAt: { not: null } },
  });
  revalidatePath("/shopping");
  return {
    ok: true,
    message: `Cleared ${r.count} item${r.count === 1 ? "" : "s"}.`,
  };
}
