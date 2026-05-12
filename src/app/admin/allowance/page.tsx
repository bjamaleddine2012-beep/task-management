import { prisma } from "@/lib/prisma";
import { centsToDollars } from "@/lib/validators/allowance";

import { AllowanceView } from "./_components/allowance-view";

export const dynamic = "force-dynamic";

export default async function AdminAllowancePage() {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      avatarColor: true,
      avatarEmoji: true,
      allowanceEntries: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          amountCents: true,
          reason: true,
          createdAt: true,
          createdBy: {
            select: { name: true, email: true },
          },
        },
      },
    },
  });

  const fmtDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const enriched = users.map((u) => {
    const balanceCents = u.allowanceEntries.reduce(
      (acc, e) => acc + e.amountCents,
      0,
    );
    return {
      id: u.id,
      name: u.name ?? u.email,
      avatarColor: u.avatarColor,
      avatarEmoji: u.avatarEmoji,
      balance: centsToDollars(balanceCents),
      balanceCents,
      entries: u.allowanceEntries.map((e) => ({
        id: e.id,
        amount: centsToDollars(e.amountCents),
        amountCents: e.amountCents,
        reason: e.reason,
        createdAtFormatted: fmtDate.format(e.createdAt),
        createdByName: e.createdBy?.name ?? e.createdBy?.email ?? "—",
      })),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Allowance</h1>
        <p className="text-sm text-muted-foreground">
          Track money owed and paid out per family member. Separate from the
          points system.
        </p>
      </header>

      <AllowanceView users={enriched} />
    </div>
  );
}
