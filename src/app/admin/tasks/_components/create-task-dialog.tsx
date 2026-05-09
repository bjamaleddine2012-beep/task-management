"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { createTaskAction, type TaskActionState } from "@/lib/actions/tasks";

type UserOption = {
  id: string;
  name: string | null;
  email: string;
};

export function CreateTaskDialog({ users }: { users: UserOption[] }) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState<
    TaskActionState,
    FormData
  >(createTaskAction, null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      formRef.current?.reset();
    }
  }, [state]);

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  // Default the date input to today (YYYY-MM-DD).
  const today = React.useMemo(
    () => new Date().toISOString().slice(0, 10),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          New task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            Assign work or instructions to a specific user.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="Review Q2 sales report"
              required
              autoComplete="off"
            />
            {fieldError("title") && (
              <p className="text-xs text-destructive">{fieldError("title")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Optional details or instructions"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {fieldError("description") && (
              <p className="text-xs text-destructive">
                {fieldError("description")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due date</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                defaultValue={today}
                min={today}
                required
              />
              {fieldError("dueDate") && (
                <p className="text-xs text-destructive">
                  {fieldError("dueDate")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <Select name="priority" defaultValue="MEDIUM">
                <SelectTrigger id="priority">
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

          <div className="space-y-1.5">
            <Label htmlFor="assignedToId">Assign to</Label>
            <Select name="assignedToId" required>
              <SelectTrigger id="assignedToId">
                <SelectValue placeholder="Pick a user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name ?? u.email}{" "}
                    <span className="text-muted-foreground">({u.email})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("assignedToId") && (
              <p className="text-xs text-destructive">
                {fieldError("assignedToId")}
              </p>
            )}
          </div>

          {state && !state.ok && !state.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
