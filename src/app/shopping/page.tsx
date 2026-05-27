import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShoppingList } from "./_components/shopping-list";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/shopping");

  const familyId = session.user.activeFamilyId;
  if (!familyId) redirect("/onboarding");

  const items = await prisma.shoppingItem.findMany({
    where: { familyId },
    orderBy: [{ checkedAt: "asc" }, { addedAt: "asc" }],
    include: {
      addedBy: {
        select: { id: true, name: true, email: true, avatarColor: true, avatarEmoji: true },
      },
      checkedBy: {
        select: { id: true, name: true, email: true, avatarColor: true, avatarEmoji: true },
      },
    },
  });

  const fmtAdded = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const serializable = items.map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    note: i.note,
    addedAtFormatted: fmtAdded.format(i.addedAt),
    isChecked: !!i.checkedAt,
    addedBy: i.addedBy,
    checkedBy: i.checkedBy,
  }));

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href={session.user.role === "ADMIN" ? "/admin" : "/"}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Shopping list</h1>
        <p className="text-sm text-muted-foreground">
          Shared across the family. Anyone can add or check off items.
        </p>
      </header>

      <ShoppingList
        items={serializable}
        currentUserId={session.user.id}
        isAdmin={session.user.role === "ADMIN"}
      />
    </div>
  );
}
