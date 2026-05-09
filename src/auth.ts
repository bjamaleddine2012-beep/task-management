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

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Bake id + role into the JWT at sign-in. On `update()` from a client,
    // re-read role from the DB so admin role changes take effect without
    // forcing the user to log out.
    jwt: async ({ token, user, trigger }) => {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      } else if (trigger === "update" && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true },
        });
        if (fresh) token.role = fresh.role;
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
