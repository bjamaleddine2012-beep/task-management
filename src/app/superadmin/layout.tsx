import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { auth, signOut } from "@/auth";
import { isSuperAdminEmail } from "@/lib/superadmin";
import { Button } from "@/components/ui/button";

// Super-admin shell. Server-side gates against ADMIN_EMAIL — non-matches
// get bounced to /. The proxy in auth.config.ts also enforces this, but
// we double-check here because a layout-level guard is the only thing
// preventing a misconfigured matcher from leaking the route.

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/superadmin");
  if (!isSuperAdminEmail(session.user.email)) redirect("/");

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-foreground" />
            <div>
              <p className="text-sm font-semibold leading-tight">
                Super-admin
              </p>
              <p className="text-xs text-muted-foreground">
                {session.user.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to admin
              </Link>
            </Button>
            <form action={handleSignOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
