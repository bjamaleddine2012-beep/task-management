"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRIORITY_DOT: Record<TaskPriority, string> = {
  HIGH: "bg-destructive",
  MEDIUM: "bg-amber-500",
  LOW: "bg-muted-foreground/40",
};

export type CalendarTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: number; // ms timestamp
  assignedTo: { name: string | null; email: string };
};

export function CalendarView({ tasks }: { tasks: CalendarTask[] }) {
  const now = new Date();
  const [cursor, setCursor] = React.useState(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );

  const monthLabel = cursor.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Build a 6-row grid: each cell is a day. Pad with previous-month days so
  // the first row always starts on Sunday.
  const firstDayOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startCell = new Date(firstDayOfMonth);
  startCell.setDate(startCell.getDate() - startCell.getDay()); // Sunday-aligned

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(startCell);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Group tasks by yyyy-mm-dd key.
  const tasksByDay = React.useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const t of tasks) {
      const d = new Date(t.dueAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCursor(
                new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1),
              )
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCursor(
                new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
              )
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="grid grid-cols-7 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-1 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const dayTasks = tasksByDay.get(key) ?? [];
            const isToday = key === todayKey;

            return (
              <div
                key={key}
                className={cn(
                  "min-h-24 border-b border-r p-1.5 text-xs",
                  !inMonth && "bg-muted/20 text-muted-foreground/50",
                  isToday && "bg-primary/5",
                )}
              >
                <div
                  className={cn(
                    "mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium",
                    isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {d.getDate()}
                </div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      className={cn(
                        "flex items-center gap-1 truncate rounded px-1 py-0.5",
                        t.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-700 line-through dark:text-emerald-400"
                          : t.status === "REJECTED"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted",
                      )}
                      title={`${t.title} — ${t.assignedTo.name ?? t.assignedTo.email}`}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          PRIORITY_DOT[t.priority],
                        )}
                      />
                      <span className="truncate">{t.title}</span>
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-muted-foreground">
                      +{dayTasks.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
