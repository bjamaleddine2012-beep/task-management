import type { DefaultSession } from "next-auth";
import type { FamilyRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      // The user's role IN THEIR ACTIVE FAMILY. "ADMIN" or "MEMBER".
      // If the user hasn't joined a family yet, this is undefined and
      // the proxy redirects them to /onboarding.
      role?: FamilyRole;
      // Active family id. The single tenant key for every server-side
      // read or write. Server actions MUST cross-check this against the
      // entity's familyId before touching it.
      activeFamilyId?: string;
      activeFamilyName?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: FamilyRole;
    activeFamilyId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: FamilyRole;
    activeFamilyId?: string;
    activeFamilyName?: string;
  }
}
