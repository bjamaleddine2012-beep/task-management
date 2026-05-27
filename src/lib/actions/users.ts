"use server";

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { requireFamilyAdmin } from "@/lib/family";
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

type AdminGate =
  | { ok: false; error: string }
  | {
      ok: true;
      session: Session;
      familyId: string;
      role: "ADMIN" | "MEMBER";
    };

async function requireAdmin(): Promise<AdminGate> {
  return (await requireFamilyAdmin()) as AdminGate;
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
  if (!gate.ok) return { ok: false, error: gate.error };

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

  // Create user + family-membership atomically. If the email already
  // exists in another family, surface a clear error rather than silently
  // adding them.
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing) {
        // Could be: same email, different family. The admin should use the
        // invite flow for that.
        throw new Prisma.PrismaClientKnownRequestError("Email exists", {
          code: "P2002",
          clientVersion: "manual",
        });
      }
      const u = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          // Legacy User.role mirror — set ADMIN if they're being made
          // family admin so older code paths still see them as admin.
          role: role === "ADMIN" ? "ADMIN" : "USER",
          activeFamilyId: gate.familyId,
        },
      });
      await tx.familyMember.create({
        data: {
          familyId: gate.familyId,
          userId: u.id,
          role,
        },
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        error: "A user with that email already exists. Use the invite link instead.",
        fieldErrors: { email: ["Email already in use"] },
      };
    }
    throw err;
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/family");
  return { ok: true, message: `User ${email} created.` };
}

// ─── Update user (name + role) ──────────────────────────────────────────────

export async function updateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

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

  // Verify the target is a member of this family.
  const target = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId: gate.familyId, userId: id } },
    select: { role: true },
  });
  if (!target) {
    return { ok: false, error: "User is not in this family." };
  }

  // Don't let the last admin demote themselves in THIS family.
  if (role === "MEMBER" && target.role === "ADMIN") {
    const adminCount = await prisma.familyMember.count({
      where: { familyId: gate.familyId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      return {
        ok: false,
        error: "You can't demote the last remaining admin.",
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    if (name !== undefined) {
      await tx.user.update({
        where: { id },
        data: { name },
      });
    }
    if (role !== undefined) {
      await tx.familyMember.update({
        where: { familyId_userId: { familyId: gate.familyId, userId: id } },
        data: { role },
      });
    }
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/family");
  return { ok: true, message: "User updated." };
}

// ─── Reset password ─────────────────────────────────────────────────────────

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

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

  // Cross-family password resets are forbidden: verify target is in this
  // family first.
  const target = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: { familyId: gate.familyId, userId: parsed.data.id },
    },
    select: { userId: true },
  });
  if (!target) {
    return { ok: false, error: "User is not in this family." };
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
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = deleteUserSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Invalid user id." };
  }

  // Refuse to delete yourself or the last admin of this family.
  if (parsed.data.id === gate.session.user.id) {
    return { ok: false, error: "You can't delete your own account." };
  }

  // Only operate on users who are members of this family.
  const target = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: { familyId: gate.familyId, userId: parsed.data.id },
    },
    select: { role: true },
  });
  if (!target) {
    return { ok: false, error: "User is not in this family." };
  }
  if (target.role === "ADMIN") {
    const adminCount = await prisma.familyMember.count({
      where: { familyId: gate.familyId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      return { ok: false, error: "You can't delete the last remaining admin." };
    }
  }

  // Remove the membership. We don't delete the User row itself — the user
  // could be a member of another family, and their authored history (e.g.
  // tasks they created elsewhere) should stay intact.
  await prisma.$transaction([
    prisma.familyMember.deleteMany({
      where: { familyId: gate.familyId, userId: parsed.data.id },
    }),
    // If they were active in this family, drop the active reference so
    // they're forced through onboarding next time.
    prisma.user.updateMany({
      where: { id: parsed.data.id, activeFamilyId: gate.familyId },
      data: { activeFamilyId: null },
    }),
  ]);

  revalidatePath("/admin/users");
  revalidatePath("/admin/family");
  return { ok: true, message: "Removed from family." };
}
