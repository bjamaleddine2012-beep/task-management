"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  Loader2,
  Plus,
  RotateCw,
  Trash2,
  PenSquare,
  Play,
} from "lucide-react";
import type { TaskPriority, TaskTemplate } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  createTemplateAction,
  deleteTemplateAction,
  spawnFromTemplateAction,
  updateTemplateAction,
  type TemplateActionState,
} from "@/lib/actions/templates";

const PRIORITY_VARIANT: Record<
  TaskPriority,
  "destructive" | "warning" | "secondary"
> = {
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
};

type UserOption = { id: string; name: string | null; email: string };

type TemplateRow = TaskTemplate & {
  defaultAssignee: { id: string; name: string | null; email: string } | null;
};

export function TemplatesView({
  templates,
  users,
}: {
  templates: TemplateRow[];
  users: UserOption[];
}) {
  const [editing, setEditing] = React.useState<TemplateRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" />
          New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-lg border bg-background p-12 text-center text-sm text-muted-foreground">
          No templates yet. Create one to speed up task assignment.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              users={users}
              onEdit={() => setEditing(t)}
            />
          ))}
        </div>
      )}

      <TemplateFormDialog
        open={creating}
        onOpenChange={setCreating}
        users={users}
      />
      <TemplateFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        users={users}
        template={editing}
      />
    </div>
  );
}

function TemplateCard({
  template,
  users,
  onEdit,
}: {
  template: TemplateRow;
  users: UserOption[];
  onEdit: () => void;
}) {
  const subtaskCount = template.subtasks
    ? template.subtasks
        .split(/\r?\n/)
        .filter((s) => s.trim().length > 0).length
    : 0;

  return (
    <Card className={template.active ? "" : "opacity-60"}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{template.name}</h3>
              <Badge variant={PRIORITY_VARIANT[template.priority]}>
                {template.priority}
              </Badge>
              {template.intervalDays ? (
                <Badge variant="outline" className="gap-1">
                  <RotateCw className="h-3 w-3" />
                  Every {template.intervalDays}d
                </Badge>
              ) : null}
              {!template.active && (
                <Badge variant="secondary">Paused</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Spawns: <span className="font-medium">{template.title}</span>
              {template.defaultAssignee &&
                ` → ${
                  template.defaultAssignee.name ?? template.defaultAssignee.email
                }`}
              {subtaskCount > 0 && ` · ${subtaskCount} checklist items`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SpawnButton template={template} users={users} />
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PenSquare className="mr-1 h-3.5 w-3.5" />
            Edit
          </Button>
          <DeleteButton id={template.id} />
        </div>
      </CardContent>
    </Card>
  );
}

function SpawnButton({
  template,
  users,
}: {
  template: TemplateRow;
  users: UserOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    spawnFromTemplateAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button
        size="sm"
        variant="default"
        onClick={() => setOpen(true)}
      >
        <Play className="mr-1 h-3.5 w-3.5" />
        Spawn now
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Spawn task from template</DialogTitle>
            <DialogDescription>
              Creates one task from <span className="font-medium">{template.name}</span>{" "}
              right now.
            </DialogDescription>
          </DialogHeader>

          <form action={action} className="space-y-4">
            <input type="hidden" name="id" value={template.id} />
            <div className="space-y-1.5">
              <Label htmlFor="spawn-assignee">Assignee</Label>
              <Select
                name="assignedToId"
                defaultValue={template.defaultAssigneeId ?? undefined}
              >
                <SelectTrigger id="spawn-assignee">
                  <SelectValue placeholder="Pick a user" />
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
            {state && !state.ok && (
              <p className="text-sm text-destructive">{state.error}</p>
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
    </>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    deleteTemplateAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" />
        Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template</DialogTitle>
            <DialogDescription>
              The template is removed. Tasks already spawned from it stay.
            </DialogDescription>
          </DialogHeader>
          <form action={action}>
            <input type="hidden" name="id" value={id} />
            {state && !state.ok && (
              <p className="text-sm text-destructive">{state.error}</p>
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
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateFormDialog({
  open,
  onOpenChange,
  users,
  template,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: UserOption[];
  template?: TemplateRow | null;
}) {
  const isEdit = !!template;
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    isEdit ? updateTemplateAction : createTemplateAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit template" : "Create template"}
          </DialogTitle>
          <DialogDescription>
            Templates are reusable task definitions. Set an interval to spawn
            them automatically.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          {isEdit && (
            <input type="hidden" name="id" value={template.id} />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Template name</Label>
              <Input
                id="t-name"
                name="name"
                placeholder="Daily lobby clean"
                required
                defaultValue={template?.name ?? ""}
              />
              {fieldError("name") && (
                <p className="text-xs text-destructive">{fieldError("name")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-priority">Priority</Label>
              <Select name="priority" defaultValue={template?.priority ?? "MEDIUM"}>
                <SelectTrigger id="t-priority">
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
            <Label htmlFor="t-title">Task title</Label>
            <Input
              id="t-title"
              name="title"
              placeholder="Clean lobby"
              required
              defaultValue={template?.title ?? ""}
            />
            {fieldError("title") && (
              <p className="text-xs text-destructive">{fieldError("title")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-description">Description</Label>
            <textarea
              id="t-description"
              name="description"
              rows={2}
              placeholder="Instructions for the assignee"
              defaultValue={template?.description ?? ""}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-subtasks">Checklist (one per line)</Label>
            <textarea
              id="t-subtasks"
              name="subtasks"
              rows={3}
              defaultValue={template?.subtasks ?? ""}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-assignee">Default assignee</Label>
              <Select
                name="defaultAssigneeId"
                defaultValue={template?.defaultAssigneeId ?? ""}
              >
                <SelectTrigger id="t-assignee">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name ?? u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-interval">Repeat every (days)</Label>
              <Input
                id="t-interval"
                name="intervalDays"
                type="number"
                min={0}
                placeholder="0 = manual"
                defaultValue={template?.intervalDays ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-hour">Due hour (0-23)</Label>
              <Input
                id="t-hour"
                name="dueHourLocal"
                type="number"
                min={0}
                max={23}
                defaultValue={template?.dueHourLocal ?? 17}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={template?.active ?? true}
              className="h-4 w-4 rounded border-input"
            />
            Active (recurring spawner runs)
          </label>

          {state && !state.ok && !state.fieldErrors && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
