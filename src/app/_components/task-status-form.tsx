"use client";

import * as React from "react";
import { useActionState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setMyTaskStatusAction, type TaskActionState } from "@/lib/actions/tasks";

// Users can only flip between PENDING and IN_PROGRESS from this control.
// Marking COMPLETED requires submitting a photo for admin review (handled
// by SubmitProofDialog). SUBMITTED / REJECTED are set by the server on
// submission and review and aren't user-selectable.
type SelfSelectableStatus = "PENDING" | "IN_PROGRESS";

export function TaskStatusForm({
  taskId,
  status,
}: {
  taskId: string;
  status: SelfSelectableStatus;
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
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="IN_PROGRESS">In progress</SelectItem>
        </SelectContent>
      </Select>
    </form>
  );
}
