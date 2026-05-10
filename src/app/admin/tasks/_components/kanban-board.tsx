"use client";

import * as React from "react";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "PENDING", label: "Pending" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "SUBMITTED", label: "Awaiting review" },
  { status: "COMPLETED", label: "Done" },
  { status: "REJECTED", label: "Rejected" },
];

const PRIORITY_VARIANT: Record<
  TaskPriority,
  "destructive" | "warning" | "secondary"
> = {
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
};

export type KanbanCard = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDateFormatted: string;
  isOverdue: boolean;
  assignedTo: { name: string | null; email: string };
};

export function KanbanBoard({ tasks }: { tasks: KanbanCard[] }) {
  const grouped = React.useMemo(() => {
    const map: Record<TaskStatus, KanbanCard[]> = {
      PENDING: [],
      IN_PROGRESS: [],
      SUBMITTED: [],
      COMPLETED: [],
      REJECTED: [],
    };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  return (
    <div className="grid gap-3 lg:grid-cols-5 md:grid-cols-3 sm:grid-cols-2">
      {COLUMNS.map(({ status, label }) => {
        const items = grouped[status];
        return (
          <div
            key={status}
            className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2"
          >
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs">
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  Empty
                </div>
              ) : (
                items.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-md border bg-background p-2 text-sm shadow-sm"
                  >
                    <p className="font-medium">{t.title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant={PRIORITY_VARIANT[t.priority]}>
                        {t.priority}
                      </Badge>
                      <span
                        className={
                          "text-xs " +
                          (t.isOverdue
                            ? "font-medium text-destructive"
                            : "text-muted-foreground")
                        }
                      >
                        {t.dueDateFormatted}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.assignedTo.name ?? t.assignedTo.email}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
