import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { signInSchema } from "@/lib/validators/auth";
import authConfig from "./auth.config";

// Full NextAuth config — runs in the Node.js runtime so Prisma + bcrypt work.
// Middleware uses auth.config.ts directly to stay edge-safe.
export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT is required when using the Credentials provider — Auth.js can't
  // create database sessions for credential sign-ins.
  session: { strategy: "jwt" },
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Role is determined per-family in the jwt() callback below
        // (using FamilyMember.role of the user's active family).
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Bake id + active family + role-in-that-family into the JWT.
    //
    // Re-read on `session.update()` so role changes (e.g. someone gets
    // promoted to family ADMIN, or switches active family) take effect
    // without the user signing out and back in.
    jwt: async ({ token, user, trigger }) => {
      const userId = (user?.id as string | undefined) ?? (token.id as string | undefined);
      if (!userId) return token;

      // First sign-in OR session refresh — re-compute everything.
      if (user || trigger === "update") {
        const fresh = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            activeFamilyId: true,
            activeFamily: { select: { name: true } },
          },
        });

        token.id = userId;
        token.activeFamilyId = fresh?.activeFamilyId ?? undefined;
        token.activeFamilyName = fresh?.activeFamily?.name ?? undefined;

        if (fresh?.activeFamilyId) {
          const membership = await prisma.familyMember.findUnique({
            where: {
              familyId_userId: {
                familyId: fresh.activeFamilyId,
                userId,
              },
            },
            select: { role: true },
          });
          token.role = membership?.role;
        } else {
          token.role = undefined;
        }
      }
      return token;
    },
  },
  events: {
    // Google's `profile()` already sets a role for new users, but if a Google
    // signup races the adapter we make absolutely sure ADMIN_EMAIL is admin.
    async signIn({ user }) {
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
      if (
        adminEmail &&
        user.email?.toLowerCase() === adminEmail &&
        user.id
      ) {
        await prisma.user
          .update({
            where: { id: user.id },
            data: { role: "ADMIN" },
          })
          .catch(() => {
            /* user row not yet committed; the profile() callback will handle it */
          });
      }
    },
  },
});
