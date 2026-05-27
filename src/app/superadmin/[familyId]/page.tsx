import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";

import {
  FamilyEditView,
  type EditMemberRow,
} from "./_components/family-edit-view";

export const dynamic = "force-dynamic";

// Per-family edit page (super-admin only).
//
// One-stop shop for managing a single family without going through the
// invite flow: rename, add members (with name/email/role/auto-password),
// edit each existing member (name + role), reset passwords, remove members.

export default async function FamilyEditPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const session = await auth();
  const myUserId = session?.user?.id ?? null;
  const isMyActiveFamily = session?.user?.activeFamilyId === familyId;

  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { tasks: true } },
      members: {
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        select: {
          role: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarColor: true,
              avatarEmoji: true,
            },
          },
        },
      },
    },
  });
  if (!family) notFound();

  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const members: EditMemberRow[] = family.members.map((m) => ({
    userId: m.user.id,
    name: m.user.name ?? "",
    email: m.user.email,
    role: m.role,
    joinedAtFormatted: fmt.format(m.joinedAt),
    avatarColor: m.user.avatarColor,
    avatarEmoji: m.user.avatarEmoji,
    isMe: m.user.id === myUserId,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/superadmin">
            <ArrowLeft className="mr-1 h-4 w-4" />
            All families
          </Link>
        </Button>
      </div>

      <FamilyEditView
        familyId={family.id}
        initialName={family.name}
        createdAtFormatted={fmt.format(family.createdAt)}
        taskCount={family._count.tasks}
        members={members}
        isMyActiveFamily={isMyActiveFamily}
      />
    </div>
  );
}
