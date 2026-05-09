import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { AddUserDialog } from "./_components/add-user-dialog";
import { UsersTable } from "./_components/users-table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await auth();
  const currentUserId = session?.user?.id ?? "";

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      createdAt: true,
      passwordHash: true,
      _count: { select: { assignedTasks: true } },
    },
  });

  // Don't ship the hash to the client — just whether one exists.
  const safeUsers = users.map(({ passwordHash, ...u }) => ({
    ...u,
    hasPassword: !!passwordHash,
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
