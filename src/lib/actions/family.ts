"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { requireFamilyAdmin } from "@/lib/family";
import { notifyAdmins } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import {
  acceptInviteSchema,
  createFamilySchema,
  createInviteSchema,
  removeMemberSchema,
  revokeInviteSchema,
  switchFamilySchema,
} from "@/lib/validators/family";

export type FamilyActionState =
  | { ok: true; message?: string; familyId?: string; inviteUrl?: string }
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

// 32 bytes of randomness, base64url-encoded — ~43 chars, unguessable.
function newInviteToken(): string {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// ─── Create a new family and become its first ADMIN ─────────────────────────

export async function createFamilyAction(
  _prev: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const parsed = createFamilySchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  // Atomic: create family, add this user as ADMIN, set activeFamilyId.
  const family = await prisma.$transaction(async (tx) => {
    const f = await tx.family.create({ data: { name: parsed.data.name } });
    await tx.familyMember.create({
      data: {
        familyId: f.id,
        userId: session.user.id,
        role: "ADMIN",
      },
    });
    await tx.user.update({
      where: { id: session.user.id },
      data: { activeFamilyId: f.id },
    });
    return f;
  });

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, message: "Family created.", familyId: family.id };
}

// ─── Create an invite (admin only) ──────────────────────────────────────────

export async function createInviteAction(
  _prev: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const gate = await requireFamilyAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = createInviteSchema.safeParse({
    role: (formData.get("role") as string) ?? "MEMBER",
    email: formData.get("email") || "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invite = await prisma.familyInvite.create({
    data: {
      familyId: gate.familyId,
      token: newInviteToken(),
      role: parsed.data.role,
      email: parsed.data.email ?? null,
      createdById: gate.session.user.id,
      expiresAt,
    },
  });

  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://task-management-nine-pearl.vercel.app";
  const inviteUrl = `${base.replace(/\/$/, "")}/join/${invite.token}`;

  revalidatePath("/admin/family");
  return {
    ok: true,
    message: "Invite created.",
    inviteUrl,
  };
}

// ─── Revoke an invite (admin only) ──────────────────────────────────────────

export async function revokeInviteAction(
  _prev: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const gate = await requireFamilyAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = revokeInviteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  // Make sure the invite belongs to *this* family — defense in depth.
  const invite = await prisma.familyInvite.findUnique({
    where: { id: parsed.data.id },
    select: { familyId: true },
  });
  if (!invite || invite.familyId !== gate.familyId) {
    return { ok: false, error: "Invite not found." };
  }

  await prisma.familyInvite.delete({ where: { id: parsed.data.id } });
  revalidatePath("/admin/family");
  return { ok: true };
}

// ─── Accept an invite (any signed-in user) ──────────────────────────────────

export async function acceptInviteAction(
  _prev: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const session = await auth();
  if (!session?.user?.id)
    return { ok: false, error: "Sign in first to accept this invite." };

  const parsed = acceptInviteSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { ok: false, error: "Invalid invite token." };

  const invite = await prisma.familyInvite.findUnique({
    where: { token: parsed.data.token },
    select: {
      id: true,
      familyId: true,
      role: true,
      expiresAt: true,
      usedAt: true,
      family: { select: { name: true } },
    },
  });
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.usedAt) return { ok: false, error: "This invite has already been used." };
  if (invite.expiresAt < new Date())
    return { ok: false, error: "This invite has expired." };

  // Already a member? Just switch to that family.
  const existing = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: { familyId: invite.familyId, userId: session.user.id },
    },
  });

  await prisma.$transaction(async (tx) => {
    if (!existing) {
      await tx.familyMember.create({
        data: {
          familyId: invite.familyId,
          userId: session.user.id,
          role: invite.role,
        },
      });
    }
    await tx.familyInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedById: session.user.id },
    });
    await tx.user.update({
      where: { id: session.user.id },
      data: { activeFamilyId: invite.familyId },
    });
  });

  void notifyAdmins(invite.familyId, {
    title: `New family member`,
    body: `${session.user.name ?? session.user.email} joined ${invite.family.name}`,
    url: "/admin/family",
    tag: `join:${session.user.id}`,
  });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/family");
  return {
    ok: true,
    message: `Joined "${invite.family.name}".`,
    familyId: invite.familyId,
  };
}

// ─── Remove a family member (admin only) ────────────────────────────────────

export async function removeFamilyMemberAction(
  _prev: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const gate = await requireFamilyAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = removeMemberSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  // Can't kick yourself; also can't kick the last admin.
  if (parsed.data.userId === gate.session.user.id) {
    return { ok: false, error: "You can't remove yourself." };
  }

  const target = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: {
        familyId: gate.familyId,
        userId: parsed.data.userId,
      },
    },
    select: { id: true, role: true },
  });
  if (!target) return { ok: false, error: "Not a member of this family." };

  if (target.role === "ADMIN") {
    const adminCount = await prisma.familyMember.count({
      where: { familyId: gate.familyId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      return {
        ok: false,
        error: "Can't remove the last admin. Promote someone else first.",
      };
    }
  }

  // Remove their membership; clear their activeFamilyId if it pointed here.
  await prisma.$transaction([
    prisma.familyMember.delete({ where: { id: target.id } }),
    prisma.user.updateMany({
      where: { id: parsed.data.userId, activeFamilyId: gate.familyId },
      data: { activeFamilyId: null },
    }),
  ]);

  revalidatePath("/admin/family");
  revalidatePath("/admin/users");
  return { ok: true, message: "Member removed." };
}

// ─── Switch active family ───────────────────────────────────────────────────
// For users who belong to >1 family. Verifies membership before flipping.

export async function switchFamilyAction(
  _prev: FamilyActionState,
  formData: FormData,
): Promise<FamilyActionState> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const parsed = switchFamilySchema.safeParse({
    familyId: formData.get("familyId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid family." };

  const m = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: {
        familyId: parsed.data.familyId,
        userId: session.user.id,
      },
    },
  });
  if (!m) return { ok: false, error: "You are not a member of that family." };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { activeFamilyId: parsed.data.familyId },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, familyId: parsed.data.familyId };
}
