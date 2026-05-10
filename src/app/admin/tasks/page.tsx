import { prisma } from "@/lib/prisma";

import { CreateTaskDialog } from "./_components/create-task-dialog";
import { ReviewQueue } from "./_components/review-queue";
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
        proofSubmittedAt: true,
        reviewNote: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { name: true, email: true } },
        proofImages: {
          select: {
            id: true,
            url: true,
            latitude: true,
            longitude: true,
            accuracyMeters: true,
          },
          orderBy: { uploadedAt: "asc" },
        },
        subtasks: {
          orderBy: { position: "asc" },
          select: { id: true, title: true, done: true },
        },
      },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  // Pre-format on the server to avoid SSR/client locale drift.
  const dueFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const submittedFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // datetime-local needs YYYY-MM-DDTHH:mm in local time, not UTC.
  const toLocalInputValue = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  };

  const formattedTasks = tasks.map((t) => ({
    ...t,
    dueDateFormatted: dueFmt.format(t.dueDate),
    dueDateLocalInput: toLocalInputValue(t.dueDate),
    proofSubmittedFormatted: t.proofSubmittedAt
      ? submittedFmt.format(t.proofSubmittedAt)
      : null,
    isOverdue: t.dueDate < new Date() && t.status !== "COMPLETED",
  }));

  const awaitingReview = formattedTasks.filter((t) => t.status === "SUBMITTED");

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Create, assign, and review submissions.
          </p>
        </div>
        <CreateTaskDialog users={users} />
      </header>

      {awaitingReview.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Awaiting review · {awaitingReview.length}
          </h2>
          <ReviewQueue tasks={awaitingReview} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          All tasks
        </h2>
        <TasksTable tasks={formattedTasks} users={users} />
      </section>
    </div>
  );
}
