"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
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
  deleteTaskAction,
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
  COMPLETED: "Done",
};

export type AdminTaskRow = {
  id: string;
  title: string;
  description: string | null;
  dueDateFormatted: string;
  dueDateISO: string;
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

  const close = () => setOpenFor(null);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-12 text-center text-sm text-muted-foreground">
        No tasks yet. Click <strong>New task</strong> to assign one.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableRow key={t.id}>
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
                <TableCell className="text-sm text-muted-foreground">
                  {STATUS_LABEL[t.status]}
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

function RowMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative inline-block text-left">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
      >
        <MoreHorizontal className="h-4 w-4" />
        <span className="sr-only">Actions</span>
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-32 rounded-md border bg-popover p-1 text-sm shadow-md">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-dueDate">Due date</Label>
                <Input
                  id="edit-dueDate"
                  name="dueDate"
                  type="date"
                  defaultValue={task.dueDateISO}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-status">Status</Label>
                <Select name="status" defaultValue={task.status}>
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                    <SelectItem value="COMPLETED">Done</SelectItem>
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
