import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  COMPLETED: "Done",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tasks = await prisma.task.findMany({
    where: { assignedToId: session.user.id },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      priority: true,
      status: true,
      createdBy: { select: { name: true, email: true } },
    },
  });

  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 3);

  const open = tasks.filter((t) => t.status !== "COMPLETED");
  const done = tasks.filter((t) => t.status === "COMPLETED");
  const overdue = open.filter((t) => t.dueDate < now);
  const dueSoon = open.filter(
    (t) => t.dueDate >= now && t.dueDate <= soon,
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My tasks</h1>
          <p className="text-sm text-muted-foreground">
            Hi {session.user.name ?? session.user.email}, you have{" "}
            <span className="font-medium text-foreground">{open.length}</span>{" "}
            open task{open.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                Past due date — please complete or update.
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
            now={now}
            soonCutoff={soon}
            highlight={
              task.dueDate < now
                ? "overdue"
                : task.dueDate <= soon
                  ? "soon"
                  : null
            }
          />
        ))}
      </Section>

      {done.length > 0 && (
        <Section title="Completed">
          {done.map((task) => (
            <TaskRow key={task.id} task={task} now={now} soonCutoff={soon} />
          ))}
        </Section>
      )}
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
  dueDate: Date;
  priority: TaskPriority;
  status: TaskStatus;
  createdBy: { name: string | null; email: string };
};

function TaskRow({
  task,
  highlight,
}: {
  task: TaskRowData;
  now: Date;
  soonCutoff: Date;
  highlight?: "overdue" | "soon" | null;
}) {
  return (
    <Card
      className={
        highlight === "overdue"
          ? "border-destructive/40"
          : highlight === "soon"
            ? "border-amber-300/60"
            : ""
      }
    >
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{task.title}</h3>
            <Badge variant={PRIORITY_VARIANT[task.priority]}>
              {task.priority}
            </Badge>
          </div>
          {task.description && (
            <p className="text-sm text-muted-foreground">{task.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Due{" "}
            <span
              className={
                highlight === "overdue"
                  ? "font-medium text-destructive"
                  : highlight === "soon"
                    ? "font-medium text-amber-700 dark:text-amber-300"
                    : ""
              }
            >
              {task.dueDate.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>{" "}
            · from {task.createdBy.name ?? task.createdBy.email}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:flex-col sm:items-end">
          <span className="text-xs text-muted-foreground">
            {STATUS_LABEL[task.status]}
          </span>
          <TaskStatusForm taskId={task.id} status={task.status} />
        </div>
      </CardContent>
    </Card>
  );
}
