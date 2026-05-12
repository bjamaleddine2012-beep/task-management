"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  DollarSign,
  LayoutDashboard,
  Library,
  ListChecks,
  LogOut,
  Menu,
  ShoppingCart,
  User,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/tasks", label: "Tasks", icon: ListChecks },
  { href: "/admin/templates", label: "Templates", icon: Library },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/allowance", label: "Allowance", icon: DollarSign },
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export function AdminShell({
  email,
  signOutAction,
  children,
}: {
  email: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const pathname = usePathname();

  // Close drawer on route change.
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open.
  React.useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30 md:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b bg-background px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/admin" className="text-base font-semibold">
          Admin
        </Link>
        <span className="w-9" /> {/* spacer for symmetric layout */}
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r bg-background md:flex">
        <SidebarInner
          email={email}
          pathname={pathname}
          signOutAction={signOutAction}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-base font-semibold">Admin</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-2 hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarInner
              email={email}
              pathname={pathname}
              signOutAction={signOutAction}
            />
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function SidebarInner({
  email,
  pathname,
  signOutAction,
}: {
  email: string;
  pathname: string;
  signOutAction: () => Promise<void>;
}) {
  return (
    <>
      <div className="hidden border-b px-6 py-5 md:block">
        <Link href="/admin" className="text-base font-semibold">
          Admin Panel
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">{email}</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <form action={signOutAction}>
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
    </>
  );
}
