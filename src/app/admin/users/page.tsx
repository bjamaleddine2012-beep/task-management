import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { AddUserDialog } from "./_components/add-user-dialog";
import { UsersTable } from "./_components/users-table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await auth();
  const currentUserId = session?.user?.id ?? "";
  const familyId = session?.user?.activeFamilyId;
  if (!familyId) return null;

  // List only users who are members of THIS family. The role shown is
  // their FamilyMember.role, not the legacy User.role.
  const members = await prisma.familyMember.findMany({
    where: { familyId },
    orderBy: [{ role: "asc" }, { joinedAt: "desc" }],
    select: {
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          passwordHash: true,
          _count: {
            select: {
              assignedTasks: { where: { familyId } },
            },
          },
        },
      },
    },
  });
  // Flatten to the shape the rest of the page expects.
  const users = members.map((m) => ({
    ...m.user,
    role: m.role, // FamilyMember.role wins (ADMIN/MEMBER)
  }));

  // Format the date on the server with an explicit locale so the client
  // doesn't re-format with a different locale and trip a hydration mismatch.
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Don't ship the hash to the client — just whether one exists.
  const safeUsers = users.map(({ passwordHash, createdAt, ...u }) => ({
    ...u,
    hasPassword: !!passwordHash,
    createdAtFormatted: dateFmt.format(createdAt),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Create accounts, change roles, reset passwords.
          </p>
        </div>
        <AddUserDialog />
      </header>

      <UsersTable users={safeUsers} currentUserId={currentUserId} />
    </div>
  );
}
