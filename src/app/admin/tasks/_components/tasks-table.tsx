"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { Copy, Loader2, MoreHorizontal, Trash2, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  bulkDeleteTasksAction,
  bulkReassignTasksAction,
  deleteTaskAction,
  duplicateTaskAction,
  updateTaskAction,
  type TaskActionState,
} from "@/lib/actions/tasks";

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
  REJECTED: "Rejected",
};

const STATUS_VARIANT: Record<
  TaskStatus,
  "secondary" | "warning" | "default" | "success" | "destructive"
> = {
  PENDING: "secondary",
  IN_PROGRESS: "default",
  SUBMITTED: "warning",
  COMPLETED: "success",
  REJECTED: "destructive",
};

export type AdminTaskRow = {
  id: string;
  title: string;
  description: string | null;
  dueDateFormatted: string;
  dueDateLocalInput: string;
  isOverdue: boolean;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo: { id: string; name: string | null; email: string };
  createdBy: { name: string | null; email: string };
};

type UserOption = {
  id: string;
  name: string | null;
  email: string;
};

type DialogKind = "edit" | "delete" | null;

export function TasksTable({
  tasks,
  users,
}: {
  tasks: AdminTaskRow[];
  users: UserOption[];
}) {
  const [openFor, setOpenFor] = React.useState<{
    task: AdminTaskRow;
    kind: DialogKind;
  } | null>(null);
  // Bulk selection state — set of selected task ids.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const close = () => setOpenFor(null);

  // Wipe stale selections if the underlying task list changes.
  React.useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(tasks.map((t) => t.id));
      const next = new Set<string>();
      for (const id of prev) if (valid.has(id)) next.add(id);
      return next;
    });
  }, [tasks]);

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === tasks.length ? new Set() : new Set(tasks.map((t) => t.id)),
    );
  };
  const clearSelection = () => setSelected(new Set());

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-12 text-center text-sm text-muted-foreground">
        No tasks yet. Click <strong>New task</strong> to assign one.
      </div>
    );
  }

  return (
    <>
      {selected.size > 0 && (
        <BulkActionBar
          ids={Array.from(selected)}
          users={users}
          onClear={clearSelection}
        />
      )}

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={
                    selected.size === tasks.length && tasks.length > 0
                  }
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-input"
                />
              </TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow
                key={t.id}
                data-state={selected.has(t.id) ? "selected" : undefined}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Select ${t.title}`}
                    checked={selected.has(t.id)}
                    onChange={() => toggleOne(t.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{t.title}</div>
                  {t.description && (
                    <div className="line-clamp-1 max-w-xs text-xs text-muted-foreground">
                      {t.description}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {t.assignedTo.name ?? t.assignedTo.email}
                </TableCell>
                <TableCell>
                  <Badge variant={PRIORITY_VARIANT[t.priority]}>
                    {t.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[t.status]}>
                    {STATUS_LABEL[t.status]}
                  </Badge>
                </TableCell>
                <TableCell
                  className={
                    t.isOverdue
                      ? "text-sm font-medium text-destructive"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {t.dueDateFormatted}
                  {t.isOverdue && " · overdue"}
                </TableCell>
                <TableCell className="text-right">
                  <RowMenu
                    taskId={t.id}
                    onEdit={() => setOpenFor({ task: t, kind: "edit" })}
                    onDelete={() => setOpenFor({ task: t, kind: "delete" })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EditTaskDialog
        task={openFor?.kind === "edit" ? openFor.task : null}
        users={users}
        onClose={close}
      />
      <DeleteTaskDialog
        task={openFor?.kind === "delete" ? openFor.task : null}
        onClose={close}
      />
    </>
  );
}

// Floats above the table when one or more rows are selected. Hosts bulk
// actions (reassign + delete) and a clear button.
function BulkActionBar({
  ids,
  users,
  onClear,
}: {
  ids: string[];
  users: UserOption[];
  onClear: () => void;
}) {
  const [reassignTo, setReassignTo] = React.useState<string>("");
  const [deleting, startDeleting] = useTransition();
  const [reassigning, startReassigning] = useTransition();

  const handleReassign = () => {
    if (!reassignTo) {
      toast.error("Pick a user");
      return;
    }
    startReassigning(async () => {
      const fd = new FormData();
      for (const id of ids) fd.append("ids", id);
      fd.set("assignedToId", reassignTo);
      const res = await bulkReassignTasksAction(null, fd);
      if (res?.ok) {
        toast.success(res.message ?? "Reassigned");
        onClear();
      } else if (res && !res.ok) {
        toast.error(res.error);
      }
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete ${ids.length} task${ids.length === 1 ? "" : "s"}? This can't be undone.`))
      return;
    startDeleting(async () => {
      const fd = new FormData();
      for (const id of ids) fd.append("ids", id);
      const res = await bulkDeleteTasksAction(null, fd);
      if (res?.ok) {
        toast.success(res.message ?? "Deleted");
        onClear();
      } else if (res && !res.ok) {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="mb-3 flex flex-col items-start gap-2 rounded-lg border bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium">
        {ids.length} selected
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={reassignTo} onValueChange={setReassignTo}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Reassign to…" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name ?? u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReassign}
          disabled={reassigning || deleting || !reassignTo}
        >
          {reassigning ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserCog className="mr-1 h-3.5 w-3.5" />
          )}
          Reassign
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={deleting || reassigning}
        >
          {deleting ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="mr-1 h-3.5 w-3.5" />
          )}
          Delete
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          disabled={deleting || reassigning}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}

function RowMenu({
  taskId,
  onEdit,
  onDelete,
}: {
  taskId: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [duplicating, startDuplicating] = useTransition();

  const handleDuplicate = () => {
    startDuplicating(async () => {
      const fd = new FormData();
      fd.set("id", taskId);
      const res = await duplicateTaskAction(null, fd);
      if (res?.ok) {
        toast.success(res.message ?? "Duplicated");
      } else if (res && !res.ok) {
        toast.error(res.error);
      }
      setOpen(false);
    });
  };

  return (
    <div className="relative inline-block text-left">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      >
        <MoreHorizontal className="h-4 w-4" />
        <span className="sr-only">Actions</span>
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-36 rounded-md border bg-popover p-1 text-sm shadow-md">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onEdit}
            className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
          >
            Edit
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleDuplicate}
            disabled={duplicating}
            className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
          >
            {duplicating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Duplicate
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDelete}
            className="block w-full rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function EditTaskDialog({
  task,
  users,
  onClose,
}: {
  task: AdminTaskRow | null;
  users: UserOption[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    TaskActionState,
    FormData
  >(updateTaskAction, null);

  React.useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>{task?.title}</DialogDescription>
        </DialogHeader>

        {task && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="id" value={task.id} />

            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                name="title"
                defaultValue={task.title}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <textarea
                id="edit-description"
                name="description"
                rows={3}
                defaultValue={task.description ?? ""}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-dueDate">Due</Label>
                <Input
                  id="edit-dueDate"
                  name="dueDate"
                  type="datetime-local"
                  defaultValue={task.dueDateLocalInput}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-priority">Priority</Label>
                <Select name="priority" defaultValue={task.priority}>
                  <SelectTrigger id="edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-status">Status</Label>
                <Select name="status" defaultValue={task.status}>
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                    <SelectItem value="SUBMITTED">Awaiting review</SelectItem>
                    <SelectItem value="COMPLETED">Done</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-assignedToId">Assignee</Label>
                <Select
                  name="assignedToId"
                  defaultValue={task.assignedTo.id}
                >
                  <SelectTrigger id="edit-assignedToId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name ?? u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {state && !state.ok && (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteTaskDialog({
  task,
  onClose,
}: {
  task: AdminTaskRow | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    TaskActionState,
    FormData
  >(deleteTaskAction, null);

  React.useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete task</DialogTitle>
          <DialogDescription>
            Permanently delete{" "}
            <span className="font-medium">{task?.title}</span>?
          </DialogDescription>
        </DialogHeader>

        {task && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="id" value={task.id} />

            {state && !state.ok && (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
