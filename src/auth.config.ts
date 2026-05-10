import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { Role } from "@prisma/client";

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
        // Auto-promote a known admin email on first OAuth signup. Optional —
        // remove if you want every Google user to start as USER.
        profile(profile) {
          const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
          const role: Role =
            adminEmail && profile.email?.toLowerCase() === adminEmail
              ? "ADMIN"
              : "USER";
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
            role,
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
        session.user.role = token.role as Role;
      }
      return session;
    },
    // Route gate. Returning `false` triggers a redirect to `pages.signIn`.
    // Returning a `Response` performs a custom redirect.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role;
      const path = nextUrl.pathname;

      const isOnLogin = path.startsWith("/login");
      const isOnAdmin = path.startsWith("/admin");
      const isPublic = isOnLogin || path === "/favicon.ico";

      if (isOnLogin) {
        if (isLoggedIn) {
          const dest = role === "ADMIN" ? "/admin" : "/";
          return Response.redirect(new URL(dest, nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) {
        if (isPublic) return true;
        const url = new URL("/login", nextUrl);
        url.searchParams.set("callbackUrl", path);
        return Response.redirect(url);
      }

      if (isOnAdmin && role !== "ADMIN") {
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
