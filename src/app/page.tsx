import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, ShieldCheck, ShoppingCart, User as UserIcon } from "lucide-react";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BadgeUpdater } from "@/components/badge-updater";
import { PushNotifications } from "@/components/push-notifications";
import { getBadgeCount } from "@/lib/notify";
import { ActivityFeed } from "@/components/activity-feed";
import { CommentThread, type CommentItem } from "./_components/comment-thread";
import { ProofThumbnails } from "./_components/proof-thumbnails";
import { SubmitProofDialog } from "./_components/submit-proof-dialog";
import { SubtaskChecklist, type SubtaskItem } from "./_components/subtask-checklist";
import { TaskStatusForm } from "./_components/task-status-form";

export const dynamic = "force-dynamic";

const PRIORITY_VARIANT: Record<
  TaskPriority,
  "destructive" | "warning" | "secondary"
> = {
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Awaiting review",
  COMPLETED: "Done",
  REJECTED: "Needs redo",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [me, tasks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, avatarColor: true, avatarEmoji: true },
    }),
    prisma.task.findMany({
      where: { assignedToId: session.user.id },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        priority: true,
        status: true,
        pointsValue: true,
        reviewNote: true,
        reviewedAt: true,
        createdBy: { select: { name: true, email: true } },
        proofImages: {
          select: { id: true, url: true },
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
  ]);

  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 3);

  const dueFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const commentFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const formatted = tasks.map((t) => ({
    ...t,
    dueDateFormatted: dueFmt.format(t.dueDate),
    isOverdue: t.dueDate < now && t.status !== "COMPLETED",
    isDueSoon:
      t.dueDate >= now && t.dueDate <= soon && t.status !== "COMPLETED",
    comments: t.comments.map(
      (c): CommentItem => ({
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
      }),
    ),
  }));

  const open = formatted.filter((t) => t.status !== "COMPLETED");
  const done = formatted.filter((t) => t.status === "COMPLETED");
  const badgeCount = await getBadgeCount(session.user.id);
  const overdue = open.filter((t) => t.isOverdue);
  const dueSoon = open.filter((t) => t.isDueSoon);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <BadgeUpdater count={badgeCount} />
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/profile" aria-label="Profile">
            <Avatar
              name={me?.name ?? me?.email ?? session.user.email}
              emoji={me?.avatarEmoji}
              color={me?.avatarColor}
              size="lg"
            />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My tasks</h1>
            <p className="text-sm text-muted-foreground">
              Hi {me?.name ?? session.user.email}, you have{" "}
              <span className="font-medium text-foreground">{open.length}</span>{" "}
              open task{open.length === 1 ? "" : "s"}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/shopping">
              <ShoppingCart className="mr-1 h-4 w-4" />
              Shopping
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/profile">
              <UserIcon className="mr-1 h-4 w-4" />
              Profile
            </Link>
          </Button>
          {session.user.role === "ADMIN" && (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">
                <ShieldCheck className="mr-1 h-4 w-4" />
                Admin
              </Link>
            </Button>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="mr-1 h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <div className="mb-6">
        <PushNotifications />
      </div>

      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {overdue.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="pb-2">
                <CardDescription className="text-destructive">
                  Overdue
                </CardDescription>
                <CardTitle className="text-3xl text-destructive">
                  {overdue.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-destructive/80">
                Past due — please complete and submit proof.
              </CardContent>
            </Card>
          )}
          {dueSoon.length > 0 && (
            <Card className="border-amber-300/60 bg-amber-50 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardDescription className="text-amber-800 dark:text-amber-300">
                  Due in the next 3 days
                </CardDescription>
                <CardTitle className="text-3xl text-amber-900 dark:text-amber-200">
                  {dueSoon.length}
                </CardTitle>
              </CardHeader>
            </Card>
          )}
        </div>
      )}

      <Section title="Open" empty="No open tasks. You're caught up.">
        {open.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            currentUserId={session.user.id}
            isAdmin={session.user.role === "ADMIN"}
          />
        ))}
      </Section>

      {done.length > 0 && (
        <Section title="Completed">
          {done.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              currentUserId={session.user.id}
              isAdmin={session.user.role === "ADMIN"}
            />
          ))}
        </Section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recent activity
          </h2>
          <Link
            href="/activity"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all →
          </Link>
        </div>
        <ActivityFeed limit={5} userId={session.user.id} />
      </section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        {title}
      </h2>
      {items.length === 0 && empty ? (
        <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

type TaskRowData = {
  id: string;
  title: string;
  description: string | null;
  dueDateFormatted: string;
  isOverdue: boolean;
  isDueSoon: boolean;
  priority: TaskPriority;
  status: TaskStatus;
  pointsValue: number;
  proofImages: Array<{ id: string; url: string }>;
  subtasks: SubtaskItem[];
  comments: CommentItem[];
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdBy: { name: string | null; email: string };
};

function TaskRow({
  task,
  currentUserId,
  isAdmin,
}: {
  task: TaskRowData;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const cardBorder = task.isOverdue
    ? "border-destructive/40"
    : task.status === "REJECTED"
      ? "border-destructive/40 bg-destructive/5"
      : task.isDueSoon
        ? "border-amber-300/60"
        : task.status === "SUBMITTED"
          ? "border-blue-300/60 bg-blue-50/40 dark:bg-blue-950/10"
          : "";

  return (
    <Card className={cardBorder}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{task.title}</h3>
            <Badge variant={PRIORITY_VARIANT[task.priority]}>
              {task.priority}
            </Badge>
            {task.pointsValue > 0 && (
              <Badge variant="outline" className="gap-1">
                🏆 {task.pointsValue} pts
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              · {STATUS_LABEL[task.status]}
            </span>
          </div>
          {task.description && (
            <p className="text-sm text-muted-foreground">{task.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Due{" "}
            <span
              className={
                task.isOverdue
                  ? "font-medium text-destructive"
                  : task.isDueSoon
                    ? "font-medium text-amber-700 dark:text-amber-300"
                    : ""
              }
            >
              {task.dueDateFormatted}
            </span>{" "}
            · from {task.createdBy.name ?? task.createdBy.email}
          </p>

          {task.subtasks.length > 0 && (
            <div className="mt-3 rounded-md border bg-muted/30 p-2">
              <SubtaskChecklist
                subtasks={task.subtasks}
                readOnly={task.status === "COMPLETED"}
              />
            </div>
          )}

          {task.proofImages.length > 0 && task.status !== "COMPLETED" && (
            <ProofThumbnails images={task.proofImages} />
          )}

          {task.status === "REJECTED" && task.reviewNote && (
            <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              <strong>Admin note:</strong> {task.reviewNote}
            </p>
          )}
          {task.status === "SUBMITTED" && (
            <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
              ⏳ Waiting for admin review.
            </p>
          )}

          <details className="mt-3 rounded-md border bg-muted/20">
            <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">
              {task.comments.length === 0
                ? "Add a comment"
                : `${task.comments.length} comment${task.comments.length === 1 ? "" : "s"}`}
            </summary>
            <div className="px-3 pb-3">
              <CommentThread
                taskId={task.id}
                comments={task.comments}
                currentUserId={currentUserId}
                isCurrentUserAdmin={isAdmin}
              />
            </div>
          </details>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          {/* Submit / re-submit proof when in progress, pending, or rejected. */}
          {task.status !== "COMPLETED" && task.status !== "SUBMITTED" && (
            <SubmitProofDialog
              taskId={task.id}
              taskTitle={task.title}
              isResubmit={task.status === "REJECTED"}
            />
          )}

          {/* Status flip available only when not yet submitted. */}
          {(task.status === "PENDING" || task.status === "IN_PROGRESS") && (
            <TaskStatusForm taskId={task.id} status={task.status} />
          )}

          {task.status === "COMPLETED" && (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              ✓ Approved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
