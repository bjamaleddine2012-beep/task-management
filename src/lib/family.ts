// Multi-tenancy enforcement helpers.
//
// Every server action that reads or writes an "owned" entity (Task,
// TaskTemplate, ShoppingItem, AllowanceEntry) MUST go through one of
// these. They return both the session AND a verified active familyId
// so the caller doesn't have to re-look-up anything.
//
// Security note: the activeFamilyId stored in the JWT is set by us at
// sign-in / session.update(), but we still re-verify membership against
// the database here. A stolen JWT couldn't be silently used to access
// a family the user isn't actually in.

import type { FamilyRole } from "@prisma/client";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type FamilyGate =
  | { ok: false; error: string }
  | {
      ok: true;
      session: Session;
      familyId: string;
      role: FamilyRole;
    };

// Resolves the user's active family + role. Verifies the FamilyMember
// row still exists (defense against stolen / stale tokens).
export async function requireFamilyMember(): Promise<FamilyGate> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const familyId = session.user.activeFamilyId;
  if (!familyId)
    return { ok: false, error: "No active family — please complete onboarding." };

  const membership = await prisma.familyMember.findUnique({
    where: {
      familyId_userId: { familyId, userId: session.user.id },
    },
    select: { role: true },
  });
  if (!membership) {
    return {
      ok: false,
      error: "You are no longer a member of this family.",
    };
  }

  return { ok: true, session, familyId, role: membership.role };
}

// Same as requireFamilyMember but additionally enforces ADMIN role.
export async function requireFamilyAdmin(): Promise<FamilyGate> {
  const gate = await requireFamilyMember();
  if (!gate.ok) return gate;
  if (gate.role !== "ADMIN") {
    return { ok: false, error: "Family admin access required" };
  }
  return gate;
}

// Validates that the given entity (by familyId) belongs to the session's
// active family. Call this defensively when an action accepts an entity
// id from FormData — the user could be sending an id from another family.
export function assertSameFamily(
  gate: Extract<FamilyGate, { ok: true }>,
  entityFamilyId: string | null | undefined,
): boolean {
  return entityFamilyId === gate.familyId;
}
