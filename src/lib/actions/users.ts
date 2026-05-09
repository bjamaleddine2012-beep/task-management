"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  deleteUserSchema,
} from "@/lib/validators/user";

const BCRYPT_ROUNDS = 12;

export type ActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { error: "Not authenticated" as const };
  }
  if (session.user.role !== "ADMIN") {
    return { error: "Admin access required" as const };
  }
  return { session };
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

// ─── Create user ────────────────────────────────────────────────────────────

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { name, email, password, role } = parsed.data;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    await prisma.user.create({
      data: { name, email, passwordHash, role },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        error: "A user with that email already exists.",
        fieldErrors: { email: ["Email already in use"] },
      };
    }
    throw err;
  }

  revalidatePath("/admin/users");
  return { ok: true, message: `User ${email} created.` };
}

// ─── Update user (name + role) ──────────────────────────────────────────────

export async function updateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = updateUserSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") || undefined,
    role: formData.get("role") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { id, name, role } = parsed.data;

  // Don't let the last admin demote themselves into a USER-only system.
  if (role === "USER") {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    if (target?.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return {
          ok: false,
          error: "You can't demote the last remaining admin.",
        };
      }
    }
  }

  await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(role !== undefined && { role }),
    },
  });

  revalidatePath("/admin/users");
  return { ok: true, message: "User updated." };
}

// ─── Reset password ─────────────────────────────────────────────────────────

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = resetPasswordSchema.safeParse({
    id: formData.get("id"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: parsed.data.id },
    data: { passwordHash },
  });

  revalidatePath("/admin/users");
  return { ok: true, message: "Password reset." };
}

// ─── Delete user ────────────────────────────────────────────────────────────

export async function deleteUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = deleteUserSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Invalid user id." };
  }

  // Refuse to delete yourself or the last admin.
  if (parsed.data.id === gate.session.user.id) {
    return { ok: false, error: "You can't delete your own account." };
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.id },
    select: { role: true },
  });
  if (!target) {
    return { ok: false, error: "User not found." };
  }
  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return { ok: false, error: "You can't delete the last remaining admin." };
    }
  }

  await prisma.user.delete({ where: { id: parsed.data.id } });
  revalidatePath("/admin/users");
  return { ok: true, message: "User deleted." };
}
