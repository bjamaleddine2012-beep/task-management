"use client";

import * as React from "react";
import { useActionState } from "react";
import type { TaskStatus } from "@prisma/client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setMyTaskStatusAction, type TaskActionState } from "@/lib/actions/tasks";

const LABEL: Record<TaskStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
};

export function TaskStatusForm({
  taskId,
  status,
}: {
  taskId: string;
  status: TaskStatus;
}) {
  const [, action, pending] = useActionState<TaskActionState, FormData>(
    setMyTaskStatusAction,
    null,
  );

  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="w-32">
      <input type="hidden" name="id" value={taskId} />
      <Select
        name="status"
        defaultValue={status}
        disabled={pending}
        onValueChange={() => {
          // Submit immediately on change.
          formRef.current?.requestSubmit();
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="PENDING">{LABEL.PENDING}</SelectItem>
          <SelectItem value="IN_PROGRESS">{LABEL.IN_PROGRESS}</SelectItem>
          <SelectItem value="COMPLETED">{LABEL.COMPLETED}</SelectItem>
        </SelectContent>
      </Select>
    </form>
  );
}
