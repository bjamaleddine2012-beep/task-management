"use client";

import * as React from "react";
import { useTransition } from "react";
import { Check } from "lucide-react";

import { toggleSubtaskAction } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils";

export type SubtaskItem = {
  id: string;
  title: string;
  done: boolean;
};

export function SubtaskChecklist({
  subtasks,
  // If true, the user can't toggle (admin-side preview, or task is COMPLETED).
  readOnly,
}: {
  subtasks: SubtaskItem[];
  readOnly?: boolean;
}) {
  if (subtasks.length === 0) return null;

  const doneCount = subtasks.filter((s) => s.done).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Checklist</span>
        <span>
          {doneCount}/{subtasks.length}
        </span>
      </div>
      <ul className="space-y-1">
        {subtasks.map((s) => (
          <SubtaskItemRow key={s.id} subtask={s} readOnly={readOnly} />
        ))}
      </ul>
    </div>
  );
}

function SubtaskItemRow({
  subtask,
  readOnly,
}: {
  subtask: SubtaskItem;
  readOnly?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  // Optimistic local state so the checkbox feels instant while the server
  // action runs.
  const [done, setDone] = React.useState(subtask.done);

  // Keep local state in sync if the server-rendered prop changes.
  React.useEffect(() => {
    setDone(subtask.done);
  }, [subtask.done]);

  const onToggle = () => {
    if (readOnly || isPending) return;
    const next = !done;
    setDone(next);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", subtask.id);
      fd.set("done", String(next));
      const res = await toggleSubtaskAction(null, fd);
      if (res && !res.ok) {
        // Revert on failure.
        setDone(!next);
      }
    });
  };

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={readOnly}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          readOnly
            ? "cursor-default"
            : "cursor-pointer hover:bg-accent disabled:cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
            done
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-transparent",
          )}
        >
          {done && <Check className="h-3 w-3" />}
        </span>
        <span
          className={cn(
            "flex-1",
            done && "text-muted-foreground line-through",
          )}
        >
          {subtask.title}
        </span>
      </button>
    </li>
  );
}
