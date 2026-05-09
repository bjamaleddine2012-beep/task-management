import { prisma } from "@/lib/prisma";

import { CreateTaskDialog } from "./_components/create-task-dialog";
import { TasksTable } from "./_components/tasks-table";

export const dynamic = "force-dynamic";

export default async function AdminTasksPage() {
  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        priority: true,
        status: true,
        createdAt: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  // Pre-format dates on the server to avoid SSR/client locale drift.
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const formattedTasks = tasks.map((t) => ({
    ...t,
    dueDateFormatted: dateFmt.format(t.dueDate),
    dueDateISO: t.dueDate.toISOString().slice(0, 10),
    isOverdue: t.dueDate < new Date() && t.status !== "COMPLETED",
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Create and assign tasks across the team.
          </p>
        </div>
        <CreateTaskDialog users={users} />
      </header>

      <TasksTable tasks={formattedTasks} users={users} />
    </div>
  );
}
