import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  LayoutDashboard,
  Library,
  ListChecks,
  LogOut,
  Users,
} from "lucide-react";

import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/tasks", label: "Tasks", icon: ListChecks },
  { href: "/admin/templates", label: "Templates", icon: Library },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side gate. The middleware already redirects non-admins, but we
  // re-check here so this layout's route handlers + Server Actions can
  // never run for a non-admin even if the matcher misses something.
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/");

  return (
    <div className="flex min-h-dvh bg-muted/30">
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r bg-background md:flex">
        <div className="px-6 py-5">
          <Link href="/admin" className="text-base font-semibold">
            Admin Panel
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {session.user.email}
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t p-3">
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
