"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/superadmin";
import { sendWelcomeCredentialsEmail } from "@/lib/email";
import { provisionFamilySchema } from "@/lib/validators/superadmin";

const BCRYPT_ROUNDS = 12;

// Action result shape. On success we return the generated (or supplied)
// password so the UI can show it ONCE in a copy box — Bassem needs this
// fallback path because Resend may not be configured (in which case the
// email won't actually be delivered, and copy-paste is the only way to
// get the credentials to the new admin).
export type SuperAdminActionState =
  | {
      ok: true;
      message?: string;
      familyId?: string;
      adminUserId?: string;
      adminEmail?: string;
      generatedPassword?: string;
      emailSent?: boolean;
      emailError?: string;
      loginUrl?: string;
    }
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

// Alphabet excludes look-alikes (0/O/o, 1/I/l/i) so the password is
// readable when dictated over the phone. 14 chars * log2(56) ≈ 81 bits
// of entropy — plenty for a temporary credential the user will rotate.
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generatePassword(length = 14): string {
  // Use rejection sampling on a power-of-two range to avoid modulo bias
  // — important when the random byte value (0..255) isn't a multiple of
  // the alphabet size (55).
  const out: string[] = [];
  const max = Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
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

// ─── Provision a new family + ADMIN user ────────────────────────────────────

export async function provisionFamilyAction(
  _prev: SuperAdminActionState,
  formData: FormData,
): Promise<SuperAdminActionState> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = provisionFamilySchema.safeParse({
    familyName: formData.get("familyName"),
    adminName: formData.get("adminName"),
    adminEmail: formData.get("adminEmail"),
    password: formData.get("password") || "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { familyName, adminName, adminEmail } = parsed.data;
  // Auto-generate if no password was supplied. Either way we hash the
  // FINAL plaintext for storage, and keep the plaintext in scope only
  // long enough to return it in the action result + email it out.
  const password = parsed.data.password ?? generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Single transaction: Family → User → FamilyMember(ADMIN).
  // The new user starts with activeFamilyId already set so they skip
  // /onboarding on first login.
  let familyId: string;
  let adminUserId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Belt-and-braces email uniqueness check — the unique index will
      // also catch this, but doing it here surfaces a cleaner error to
      // the form before we waste a Family insert.
      const existing = await tx.user.findUnique({
        where: { email: adminEmail },
        select: { id: true },
      });
      if (existing) {
        throw new Prisma.PrismaClientKnownRequestError("Email exists", {
          code: "P2002",
          clientVersion: "manual",
        });
      }

      const family = await tx.family.create({
        data: { name: familyName },
      });
      const user = await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          passwordHash,
          // Legacy User.role column — kept as ADMIN for backward compat
          // with any code that still inspects it; the real authorization
          // signal is FamilyMember.role below.
          role: "ADMIN",
          activeFamilyId: family.id,
        },
      });
      await tx.familyMember.create({
        data: {
          familyId: family.id,
          userId: user.id,
          role: "ADMIN",
        },
      });
      return { familyId: family.id, adminUserId: user.id };
    });
    familyId = result.familyId;
    adminUserId = result.adminUserId;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        error:
          "A user with that email already exists. Pick a different email or remove the existing user first.",
        fieldErrors: { adminEmail: ["Email already in use"] },
      };
    }
    throw err;
  }

  // Best-effort email. The user has been created either way — if email
  // delivery fails (Resend unconfigured, or transient API error), the
  // UI shows the generated password inline so Bassem can send it
  // manually. We never block on this.
  const url = loginUrl();
  const emailResult = await sendWelcomeCredentialsEmail({
    to: adminEmail,
    name: adminName,
    familyName,
    password,
    loginUrl: url,
  });

  revalidatePath("/superadmin");
  return {
    ok: true,
    message: emailResult.sent
      ? `Family "${familyName}" created and credentials emailed to ${adminEmail}.`
      : `Family "${familyName}" created. Email could not be sent — copy the password below and share it manually.`,
    familyId,
    adminUserId,
    adminEmail,
    generatedPassword: password,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.reason,
    loginUrl: url,
  };
}

// ─── Resend / regenerate credentials for an existing provisioned admin ─────
//
// For when the email bounced, the user lost the password before logging
// in, or Bassem just wants to send a fresh credential. Always generates
// a NEW password (we can't recover the existing one — it's hashed).
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
    adminUserId: user.id,
    adminEmail: user.email,
    generatedPassword: password,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.reason,
    loginUrl: url,
  };
}
