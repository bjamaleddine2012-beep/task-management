import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { CalendarView } from "./_components/calendar-view";
import { CreateTaskDialog } from "./_components/create-task-dialog";
import { ExportCsvButton } from "./_components/export-csv-button";
import { KanbanBoard } from "./_components/kanban-board";
import { ReviewQueue } from "./_components/review-queue";
import { TasksTable } from "./_components/tasks-table";
import { ViewSwitcher, type View } from "./_components/view-switcher";

export const dynamic = "force-dynamic";

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  const familyId = session?.user?.activeFamilyId;
  if (!familyId) {
    // Proxy should have redirected, but bail safely if not.
    return null;
  }
  const { view: viewParam } = await searchParams;
  const view: View =
    viewParam === "kanban" || viewParam === "calendar" ? viewParam : "table";
  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where: { familyId },
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
        fromTemplateId: true,
        aiVerdict: true,
        aiConfidence: true,
        aiReasoning: true,
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
        comments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            body: true,
            createdAt: true,
            reactions: { select: { emoji: true, userId: true } },
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarColor: true,
                avatarEmoji: true,
                role: true,
              },
            },
          },
        },
      },
    }),
    // Members of THIS family only — for assignee pickers etc.
    prisma.user.findMany({
      where: { familyMemberships: { some: { familyId } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  // Photo comparison: for any SUBMITTED task that came from a template, find
  // the most recent COMPLETED prior instance from the same template so the
  // admin can compare photos side-by-side. One round-trip per submitted task
  // — fine at this scale; we'd batch with a window function in SQL if it
  // grew.
  const submittedFromTemplates = tasks.filter(
    (t) => t.status === "SUBMITTED" && t.fromTemplateId,
  );
  const previousByTaskId = new Map<string, { url: string }[]>();
  if (submittedFromTemplates.length > 0) {
    const prevs = await Promise.all(
      submittedFromTemplates.map((t) =>
        prisma.task.findFirst({
          where: {
            fromTemplateId: t.fromTemplateId!,
            id: { not: t.id },
            status: "COMPLETED",
            familyId, // family-scope the lookup
          },
          orderBy: { reviewedAt: "desc" },
          select: {
            proofImages: {
              select: { url: true },
              orderBy: { uploadedAt: "asc" },
            },
          },
        }),
      ),
    );
    submittedFromTemplates.forEach((t, i) => {
      const imgs = prevs[i]?.proofImages ?? [];
      if (imgs.length > 0) previousByTaskId.set(t.id, imgs);
    });
  }

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
  const commentFmt = submittedFmt;

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
    previousProofImages: previousByTaskId.get(t.id) ?? [],
    comments: t.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAtFormatted: commentFmt.format(c.createdAt),
      reactions: c.reactions,
      user: {
        id: c.user.id,
        name: c.user.name,
        email: c.user.email,
        avatarColor: c.user.avatarColor,
        avatarEmoji: c.user.avatarEmoji,
        isAdmin: c.user.role === "ADMIN",
      },
    })),
  }));

  const awaitingReview = formattedTasks
    .filter((t) => t.status === "SUBMITTED")
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      dueDateFormatted: t.dueDateFormatted,
      proofSubmittedFormatted: t.proofSubmittedFormatted,
      proofImages: t.proofImages,
      subtasks: t.subtasks,
      assignedTo: t.assignedTo,
      previousProofImages: t.previousProofImages,
      aiVerdict: t.aiVerdict as "match" | "mismatch" | "uncertain" | null,
      aiConfidence: t.aiConfidence,
      aiReasoning: t.aiReasoning,
      comments: t.comments,
    }));

  const currentUserId = session?.user?.id ?? "";

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Create, assign, and review submissions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewSwitcher active={view} />
          <ExportCsvButton />
          <CreateTaskDialog users={users} />
        </div>
      </header>

      {awaitingReview.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Awaiting review · {awaitingReview.length}
          </h2>
          <ReviewQueue tasks={awaitingReview} currentUserId={currentUserId} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          All tasks
        </h2>
        {view === "kanban" ? (
          <KanbanBoard
            tasks={formattedTasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              dueDateFormatted: t.dueDateFormatted,
              isOverdue: t.isOverdue,
              assignedTo: t.assignedTo,
            }))}
          />
        ) : view === "calendar" ? (
          <CalendarView
            tasks={formattedTasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              dueAt: t.dueDate.getTime(),
              assignedTo: t.assignedTo,
            }))}
          />
        ) : (
          <TasksTable tasks={formattedTasks} users={users} />
        )}
      </section>
    </div>
  );
}
