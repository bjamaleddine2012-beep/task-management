// Next.js 16 renamed `middleware` to `proxy`. The file lives at `src/proxy.ts`
// and must export a function named `proxy` (or as default).
//
// We use NextAuth's edge-safe config (no Prisma / bcrypt) so this runs on the
// edge runtime. The full Node-runtime config (with Credentials + adapter)
// lives in `src/auth.ts`.

import NextAuth from "next-auth";
import authConfig from "@/auth.config";

const nextAuth = NextAuth(authConfig);

export default nextAuth.auth;

export const config = {
  matcher: [
    // `api/blob/upload` is excluded too — Vercel's blob service calls it
    // server-to-server with a signed payload (no session cookie), and the
    // route handler does its own auth check on the token-issuance step.
    "/((?!api/auth|api/blob/upload|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
