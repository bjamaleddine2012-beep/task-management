import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { FamilyAdminView } from "./_components/family-admin-view";

export const dynamic = "force-dynamic";

export default async function AdminFamilyPage() {
  const session = await auth();
  const familyId = session?.user?.activeFamilyId;
  if (!familyId) return null;

  const [family, members, invites] = await Promise.all([
    prisma.family.findUnique({
      where: { id: familyId },
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.familyMember.findMany({
      where: { familyId },
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
    }),
    prisma.familyInvite.findMany({
      where: { familyId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        role: true,
        email: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  ]);
  if (!family) return null;

  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://task-management-nine-pearl.vercel.app";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {family.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage who's in this family and send invites.
        </p>
      </header>

      <FamilyAdminView
        members={members.map((m) => ({
          userId: m.user.id,
          name: m.user.name ?? m.user.email,
          email: m.user.email,
          avatarColor: m.user.avatarColor,
          avatarEmoji: m.user.avatarEmoji,
          role: m.role,
          joinedAtFormatted: m.joinedAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          isMe: m.user.id === session.user.id,
        }))}
        invites={invites.map((i) => ({
          id: i.id,
          url: `${base.replace(/\/$/, "")}/join/${i.token}`,
          role: i.role,
          email: i.email,
          expiresAtFormatted: i.expiresAt.toLocaleString("en-US"),
        }))}
      />
    </div>
  );
}
