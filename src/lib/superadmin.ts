// Super-admin gate.
//
// The "super-admin" is the bootstrap operator (Bassem) — identified by
// matching `session.user.email` against `process.env.ADMIN_EMAIL`. It is
// a *system-level* role that lives OUTSIDE the per-family ADMIN/MEMBER
// model.
//
// Why a separate concept?
//   - Family admins manage their own family only.
//   - The super-admin can create families on behalf of other people
//     (provision new tenants), and the people he creates start as the
//     ADMIN of their own family — Bassem doesn't have to be a member.
//
// There is no DB flag for this — the env var IS the source of truth. To
// rotate the super-admin, set ADMIN_EMAIL to a different address.
//
// Defense in depth: the proxy in auth.config.ts also bounces non-matching
// emails away from /superadmin, but every server action that does
// privileged work re-checks via requireSuperAdmin() before touching the DB.

import type { Session } from "next-auth";

import { auth } from "@/auth";

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!admin) return false;
  return !!email && email.toLowerCase() === admin;
}

export type SuperAdminGate =
  | { ok: false; error: string }
  | { ok: true; session: Session };

export async function requireSuperAdmin(): Promise<SuperAdminGate> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };
  if (!isSuperAdminEmail(session.user.email)) {
    // Same generic message you'd give an unauthenticated user so we don't
    // leak the existence of /superadmin to family admins probing around.
    return { ok: false, error: "Not authorized" };
  }
  return { ok: true, session };
}
