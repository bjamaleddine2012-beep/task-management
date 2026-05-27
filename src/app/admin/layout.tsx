import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { AdminShell } from "./_components/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side gate. The proxy already redirects non-admins, but we
  // re-check here so this layout's route handlers + Server Actions can
  // never run for a non-admin even if the matcher misses something.
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.role !== "ADMIN") redirect("/");

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AdminShell
      email={session.user.email ?? ""}
      familyName={session.user.activeFamilyName ?? "Family"}
      signOutAction={handleSignOut}
    >
      {children}
    </AdminShell>
  );
}
