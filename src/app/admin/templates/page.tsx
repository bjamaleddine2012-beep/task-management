import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { TemplatesView } from "./_components/templates-view";

export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  const session = await auth();
  const familyId = session?.user?.activeFamilyId;
  if (!familyId) return null;

  const [templates, users] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { familyId },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      include: {
        defaultAssignee: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.user.findMany({
      where: { familyMemberships: { some: { familyId } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-sm text-muted-foreground">
          Pre-fill tasks for repeated work. Set an interval to auto-create them
          on a schedule.
        </p>
      </header>

      <TemplatesView templates={templates} users={users} />
    </div>
  );
}
