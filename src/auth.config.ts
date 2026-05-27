import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { FamilyRole, Role } from "@prisma/client";

// Edge-safe slice of the NextAuth config.
//
// The middleware imports this (NOT auth.ts) because Prisma + bcrypt can't run
// in the edge runtime. The Credentials provider — which needs both — is added
// in auth.ts where the full Node runtime is available.

// Only register Google if the OAuth creds are actually set, so missing
// env vars in local dev don't crash the auth route.
const googleEnabled =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

// `Provider` isn't a public export from "next-auth"; derive it from the
// config type so we don't depend on internals.
type Provider = NonNullable<NextAuthConfig["providers"]>[number];

const providers: Provider[] = googleEnabled
  ? [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        // We no longer assign a global role at signup. New Google users
        // arrive without a family; the proxy gate sends them to
        // /onboarding where they create or join one. The legacy User.role
        // column is still populated for backward compatibility.
        profile(profile) {
          const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
          const legacyRole: Role =
            adminEmail && profile.email?.toLowerCase() === adminEmail
              ? "ADMIN"
              : "USER";
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
            role: legacyRole as unknown as FamilyRole, // type slot kept for NextAuth; real role is FamilyMember.role
          };
        },
      }),
    ]
  : [];

export const isGoogleEnabled = googleEnabled;

export default {
  providers,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Reflect JWT contents onto the session object that pages and middleware
    // see via `auth()` / `useSession()`.
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      if (token.role && session.user) {
        session.user.role = token.role as FamilyRole;
      }
      if (token.activeFamilyId && session.user) {
        session.user.activeFamilyId = token.activeFamilyId as string;
        session.user.activeFamilyName = token.activeFamilyName as
          | string
          | undefined;
      }
      return session;
    },
    // Route gate. Returning `false` triggers a redirect to `pages.signIn`.
    // Returning a `Response` performs a custom redirect.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role;
      const activeFamilyId = auth?.user?.activeFamilyId;
      const userEmail = auth?.user?.email?.toLowerCase();
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      const isSuperAdmin = !!adminEmail && userEmail === adminEmail;
      const path = nextUrl.pathname;

      const isOnLogin = path.startsWith("/login");
      const isOnAdmin = path.startsWith("/admin");
      const isOnSuperAdmin = path.startsWith("/superadmin");
      const isOnOnboarding = path.startsWith("/onboarding");
      const isOnJoin = path.startsWith("/join/");

      // Public assets. The matcher SHOULD already exclude these but treat it
      // as defense-in-depth — the negative lookahead can be brittle, and we
      // don't want the manifest or icons to redirect to /login (would break
      // PWA install).
      const isPublicAsset =
        path === "/manifest.json" ||
        path === "/sw.js" ||
        path === "/favicon.ico" ||
        path === "/robots.txt" ||
        /\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/.test(path);

      if (isPublicAsset) return true;

      if (isOnLogin) {
        if (isLoggedIn) {
          // Already signed in: send onboarding-less users to onboarding,
          // family admins to /admin, plain members to /.
          const dest = !activeFamilyId
            ? "/onboarding"
            : role === "ADMIN"
              ? "/admin"
              : "/";
          return Response.redirect(new URL(dest, nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) {
        const url = new URL("/login", nextUrl);
        url.searchParams.set("callbackUrl", path);
        return Response.redirect(url);
      }

      // Multi-tenant gate: a signed-in user with no active family must
      // create or join one before doing anything else. /join/<token> and
      // /onboarding are the only paths that work without a family.
      // /superadmin is also exempt — it operates above the family system,
      // so the super-admin shouldn't be forced through onboarding.
      if (
        !activeFamilyId &&
        !isOnOnboarding &&
        !isOnJoin &&
        !isOnSuperAdmin
      ) {
        return Response.redirect(new URL("/onboarding", nextUrl));
      }
      // If they DO have a family, keep them out of onboarding.
      if (activeFamilyId && isOnOnboarding) {
        return Response.redirect(new URL("/", nextUrl));
      }

      if (isOnAdmin && role !== "ADMIN") {
        return Response.redirect(new URL("/", nextUrl));
      }

      // Defense in depth: /superadmin is gated by ADMIN_EMAIL match. The
      // layout re-checks this, but proxying it here means non-matching
      // users never even hit the layout's RSC render.
      if (isOnSuperAdmin && !isSuperAdmin) {
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
