"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { Prisma, type FamilyRole } from "@prisma/client";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/superadmin";
import { sendWelcomeCredentialsEmail } from "@/lib/email";
import {
  deleteFamilySchema,
  provisionFamilySchema,
} from "@/lib/validators/superadmin";

const BCRYPT_ROUNDS = 12;

// One row in the credentials reveal panel — shown after a successful
// provision so Bassem can copy/dispatch them manually as a fallback.
export type CredentialRow = {
  name: string;
  email: string;
  role: FamilyRole;
  password: string;
  emailSent: boolean;
  emailError?: string;
};

export type SuperAdminActionState =
  | {
      ok: true;
      message?: string;
      familyId?: string;
      // For provision-family responses (many members at once).
      credentials?: CredentialRow[];
      loginUrl?: string;
      // For single-user paths (regenerate one password).
      single?: {
        email: string;
        password: string;
        emailSent: boolean;
        emailError?: string;
      };
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    }
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

// Look-alike-free alphabet for human-readable temporary passwords.
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generatePassword(length = 14): string {
  const out: string[] = [];
  const max =
    Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
  while (out.length < length) {
    const buf = randomBytes(length);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const b = buf[i];
      if (b < max) out.push(PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]);
    }
  }
  return out.join("");
}

function loginUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://task-management-nine-pearl.vercel.app";
  return `${base.replace(/\/$/, "")}/login`;
}

// ─── Provision a family + one-or-many members ───────────────────────────────

export async function provisionFamilyAction(
  _prev: SuperAdminActionState,
  formData: FormData,
): Promise<SuperAdminActionState> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  // The form serializes member rows as JSON in a hidden input — easier
  // than parsing indexed FormData keys for variable-length lists.
  let rawMembers: unknown;
  try {
    rawMembers = JSON.parse(String(formData.get("members") ?? "[]"));
  } catch {
    return { ok: false, error: "Member list was malformed." };
  }

  const parsed = provisionFamilySchema.safeParse({
    familyName: formData.get("familyName"),
    members: rawMembers,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { familyName, members } = parsed.data;

  // Pre-hash every password so the transaction is purely DB work.
  // bcrypt is CPU-bound; doing it inside the transaction would extend
  // the row-lock window for no reason.
  const prepared = await Promise.all(
    members.map(async (m) => {
      const password = m.password ?? generatePassword();
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      return {
        name: m.name,
        email: m.email,
        role: m.role,
        password,
        passwordHash,
      };
    }),
  );

  let familyId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Bail early if any email already belongs to another user. The
      // unique index would catch this too, but doing it up-front gives a
      // cleaner error and avoids partial inserts.
      const existing = await tx.user.findMany({
        where: { email: { in: prepared.map((p) => p.email) } },
        select: { email: true },
      });
      if (existing.length > 0) {
        // Surface the conflict on the right field so the UI can mark it.
        const conflict = existing.map((e) => e.email).join(", ");
        const idx = prepared.findIndex((p) => existing.some((e) => e.email === p.email));
        throw new ProvisionError(
          `Already in use: ${conflict}`,
          idx >= 0 ? { [`members.${idx}.email`]: ["Already in use"] } : undefined,
        );
      }

      const family = await tx.family.create({ data: { name: familyName } });

      // Create each User + matching FamilyMember row. Sequential rather
      // than Promise.all so any failure aborts the txn cleanly.
      for (const m of prepared) {
        const user = await tx.user.create({
          data: {
            name: m.name,
            email: m.email,
            passwordHash: m.passwordHash,
            // Legacy User.role mirror — ADMIN for both family roles isn't
            // accurate, so map MEMBER → USER on the legacy column.
            role: m.role === "ADMIN" ? "ADMIN" : "USER",
            activeFamilyId: family.id,
          },
        });
        await tx.familyMember.create({
          data: { familyId: family.id, userId: user.id, role: m.role },
        });
      }

      return { familyId: family.id };
    });
    familyId = result.familyId;
  } catch (err) {
    if (err instanceof ProvisionError) {
      return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        error: "One of those emails is already in use.",
      };
    }
    throw err;
  }

  // Send a credentials email to every new member. We do this OUTSIDE
  // the DB transaction — best-effort, never block creation on email.
  const url = loginUrl();
  const credentials: CredentialRow[] = await Promise.all(
    prepared.map(async (m) => {
      const res = await sendWelcomeCredentialsEmail({
        to: m.email,
        name: m.name,
        familyName,
        password: m.password,
        loginUrl: url,
      });
      return {
        name: m.name,
        email: m.email,
        role: m.role,
        password: m.password,
        emailSent: res.sent,
        emailError: res.sent ? undefined : res.reason,
      };
    }),
  );

  revalidatePath("/superadmin");
  const allSent = credentials.every((c) => c.emailSent);
  return {
    ok: true,
    message: allSent
      ? `Family "${familyName}" created. Credentials emailed to ${credentials.length} member${
          credentials.length === 1 ? "" : "s"
        }.`
      : `Family "${familyName}" created. Some emails couldn't be sent — copy the passwords below and share them manually.`,
    familyId,
    credentials,
    loginUrl: url,
  };
}

// Internal error so we can throw → catch with structured field errors
// out of the inside of the transaction callback.
class ProvisionError extends Error {
  fieldErrors?: Record<string, string[]>;
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

// ─── Regenerate one user's password ─────────────────────────────────────────

export async function regenerateCredentialsAction(
  _prev: SuperAdminActionState,
  formData: FormData,
): Promise<SuperAdminActionState> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { ok: false, error: "Missing user id." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      activeFamily: { select: { id: true, name: true } },
    },
  });
  if (!user) return { ok: false, error: "User not found." };
  if (!user.activeFamily) {
    return {
      ok: false,
      error: "User has no active family — can't regenerate credentials.",
    };
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  const url = loginUrl();
  const emailResult = await sendWelcomeCredentialsEmail({
    to: user.email,
    name: user.name ?? user.email,
    familyName: user.activeFamily.name,
    password,
    loginUrl: url,
  });

  revalidatePath("/superadmin");
  return {
    ok: true,
    message: emailResult.sent
      ? `New password emailed to ${user.email}.`
      : `Password reset. Email could not be sent — copy the password below.`,
    familyId: user.activeFamily.id,
    loginUrl: url,
    single: {
      email: user.email,
      password,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.reason,
    },
  };
}

// ─── Delete a family (everything inside it goes too) ────────────────────────
//
// Prisma's onDelete: Cascade on Family → (FamilyMember, Task, TaskTemplate,
// ShoppingItem, AllowanceEntry, FamilyInvite) means a single delete wipes
// the tenant clean. Member User rows are NOT removed (they may belong to
// other families; their `activeFamilyId` flips to NULL via SetNull and
// they get bounced through onboarding on next sign-in).
//
// Safety: refuses to delete the super-admin's OWN active family — that's
// nearly always a foot-gun. Switch families first, then delete.

export async function deleteFamilyAction(
  _prev: SuperAdminActionState,
  formData: FormData,
): Promise<SuperAdminActionState> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = deleteFamilySchema.safeParse({
    familyId: formData.get("familyId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid family id." };

  // Re-read session for the super-admin's CURRENT active family — we don't
  // trust the gate's session for this since /superadmin doesn't depend on it.
  const session = await auth();
  if (session?.user?.activeFamilyId === parsed.data.familyId) {
    return {
      ok: false,
      error:
        "Can't delete your own active family. Switch to a different family first, then delete.",
    };
  }

  const family = await prisma.family.findUnique({
    where: { id: parsed.data.familyId },
    select: { id: true, name: true },
  });
  if (!family) return { ok: false, error: "Family not found." };

  await prisma.family.delete({ where: { id: family.id } });

  revalidatePath("/superadmin");
  return {
    ok: true,
    message: `Deleted "${family.name}" and all of its data.`,
  };
}
