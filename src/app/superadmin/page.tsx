import { prisma } from "@/lib/prisma";
import { ProvisionForm } from "./_components/provision-form";
import { FamiliesList, type FamilyRow } from "./_components/families-list";

export const dynamic = "force-dynamic";

// Super-admin overview. Lists every Family in the system (this is the
// ONE place that intentionally queries across tenants — everything else
// is family-scoped), plus the provisioning form.

export default async function SuperAdminPage() {
  // Single round-trip: pull families with member counts + the admin's
  // contact info (for the "resend credentials" affordance).
  const families = await prisma.family.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: {
        where: { role: "ADMIN" },
        orderBy: { joinedAt: "asc" },
        take: 1,
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      _count: {
        select: { members: true, tasks: true },
      },
    },
  });

  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const rows: FamilyRow[] = families.map((f) => {
    const firstAdmin = f.members[0]?.user;
    return {
      id: f.id,
      name: f.name,
      createdAtFormatted: fmt.format(f.createdAt),
      memberCount: f._count.members,
      taskCount: f._count.tasks,
      adminUserId: firstAdmin?.id ?? null,
      adminName: firstAdmin?.name ?? null,
      adminEmail: firstAdmin?.email ?? null,
    };
  });

  const emailConfigured = !!process.env.RESEND_API_KEY;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Provisioning</h1>
        <p className="text-sm text-muted-foreground">
          Create a family on behalf of someone else. The system creates the
          family, an ADMIN account inside it, and emails them their
          credentials so they can sign in.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          New family
        </h2>
        <ProvisionForm emailConfigured={emailConfigured} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          All families · {rows.length}
        </h2>
        <FamiliesList families={rows} />
      </section>
    </div>
  );
}
