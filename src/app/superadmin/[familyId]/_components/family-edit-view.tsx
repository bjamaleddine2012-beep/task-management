"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import {
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import type { FamilyRole } from "@prisma/client";

import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  addMemberAction,
  deleteFamilyAction,
  removeMemberAction,
  renameFamilyAction,
  resetMemberPasswordAction,
  updateMemberAction,
  type SuperAdminActionState,
} from "@/lib/actions/superadmin";
import { SingleCredentialCard } from "../../_components/provision-form";

export type EditMemberRow = {
  userId: string;
  name: string;
  email: string;
  role: FamilyRole;
  joinedAtFormatted: string;
  avatarColor: string | null;
  avatarEmoji: string | null;
  // True if this row IS the super-admin (Bassem); used to prevent
  // self-demotion/self-remove in the UI.
  isMe: boolean;
};

export function FamilyEditView({
  familyId,
  initialName,
  createdAtFormatted,
  taskCount,
  members,
  isMyActiveFamily,
}: {
  familyId: string;
  initialName: string;
  createdAtFormatted: string;
  taskCount: number;
  members: EditMemberRow[];
  isMyActiveFamily: boolean;
}) {
  return (
    <div className="space-y-6">
      <FamilyHeader
        familyId={familyId}
        initialName={initialName}
        createdAtFormatted={createdAtFormatted}
        taskCount={taskCount}
        memberCount={members.length}
        isMyActiveFamily={isMyActiveFamily}
      />

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Members · {members.length}
        </h2>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {members.map((m) => (
                <MemberItem key={m.userId} familyId={familyId} member={m} />
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Add a member
        </h2>
        <AddMemberForm familyId={familyId} />
      </section>
    </div>
  );
}

// ─── Header: name (editable inline) + delete-family button ─────────────────

function FamilyHeader({
  familyId,
  initialName,
  createdAtFormatted,
  taskCount,
  memberCount,
  isMyActiveFamily,
}: {
  familyId: string;
  initialName: string;
  createdAtFormatted: string;
  taskCount: number;
  memberCount: number;
  isMyActiveFamily: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(initialName);
  const [renameState, renameAction, renaming] = useActionState<
    SuperAdminActionState,
    FormData
  >(renameFamilyAction, null);
  const [deletePending, startDelete] = useTransition();

  React.useEffect(() => {
    if (renameState?.ok) {
      setEditing(false);
      toast.success(renameState.message ?? "Renamed");
    } else if (renameState && !renameState.ok) {
      toast.error(renameState.error);
    }
  }, [renameState]);

  const onDelete = () => {
    const typed = window.prompt(
      `Delete "${initialName}" and EVERYTHING in it (members' family access, tasks, shopping list, allowance — all gone).\n\nThis cannot be undone.\n\nType the family name exactly to confirm:`,
    );
    if (typed === null) return;
    if (typed !== initialName) {
      toast.error("Name didn't match — nothing deleted.");
      return;
    }
    startDelete(async () => {
      const fd = new FormData();
      fd.set("familyId", familyId);
      const res = await deleteFamilyAction(null, fd);
      if (res?.ok) {
        toast.success(res.message ?? "Deleted");
        router.push("/superadmin");
      } else if (res && !res.ok) {
        toast.error(res.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form action={renameAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="familyId" value={familyId} />
              <Input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 max-w-sm"
                required
                autoFocus
              />
              <Button type="submit" size="sm" disabled={renaming}>
                {renaming && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setName(initialName);
                }}
                disabled={renaming}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl">{initialName}</CardTitle>
              {isMyActiveFamily && (
                <Badge variant="outline" className="text-[10px]">
                  your active family
                </Badge>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded p-1 text-muted-foreground hover:bg-accent"
                aria-label="Rename"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Created {createdAtFormatted} · {memberCount} member
            {memberCount === 1 ? "" : "s"} · {taskCount} task
            {taskCount === 1 ? "" : "s"}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDelete}
          disabled={deletePending || isMyActiveFamily}
          title={
            isMyActiveFamily
              ? "Switch to another family first."
              : "Delete family"
          }
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {deletePending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-1 h-4 w-4" />
          )}
          Delete family
        </Button>
      </CardHeader>
    </Card>
  );
}

// ─── One member row (edit / reset password / remove) ──────────────────────

function MemberItem({
  familyId,
  member,
}: {
  familyId: string;
  member: EditMemberRow;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [resetState, resetAction, resetting] = useActionState<
    SuperAdminActionState,
    FormData
  >(resetMemberPasswordAction, null);
  const [removePending, startRemove] = useTransition();

  React.useEffect(() => {
    if (resetState?.ok && resetState.single?.emailSent) {
      toast.success(resetState.message ?? "Sent");
    } else if (resetState?.ok && resetState.single && !resetState.single.emailSent) {
      toast.warning(resetState.message ?? "Reset — email failed");
    } else if (resetState && !resetState.ok) {
      toast.error(resetState.error);
    }
  }, [resetState]);

  const onRemove = () => {
    const what = member.name || member.email;
    if (
      !confirm(
        `Remove ${what} from this family? Their account stays — they just lose access to this family's tasks, shopping list, etc.`,
      )
    )
      return;
    startRemove(async () => {
      const fd = new FormData();
      fd.set("familyId", familyId);
      fd.set("userId", member.userId);
      const res = await removeMemberAction(null, fd);
      if (res?.ok) toast.success(res.message ?? "Removed");
      else if (res && !res.ok) toast.error(res.error);
    });
  };

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar
          name={member.name || member.email}
          color={member.avatarColor}
          emoji={member.avatarEmoji}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {member.name || "—"}
            {member.isMe && (
              <span className="text-xs text-muted-foreground">(you)</span>
            )}
            <Badge variant={member.role === "ADMIN" ? "default" : "secondary"} className="text-[10px]">
              {member.role}
            </Badge>
          </p>
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          <p className="text-xs text-muted-foreground">
            Joined {member.joinedAtFormatted}
          </p>
        </div>

        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Edit
          </Button>
          <form action={resetAction}>
            <input type="hidden" name="familyId" value={familyId} />
            <input type="hidden" name="userId" value={member.userId} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={resetting || removePending}
            >
              {resetting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="mr-1 h-3.5 w-3.5" />
              )}
              Reset password
            </Button>
          </form>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={removePending || resetting || member.isMe}
            title={member.isMe ? "You can't remove yourself here." : "Remove from family"}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {removePending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserX className="mr-1 h-3.5 w-3.5" />
            )}
            Remove
          </Button>
        </div>
      </div>

      {resetState?.ok && resetState.single && (
        <div className="mt-3">
          <SingleCredentialCard
            email={resetState.single.email}
            password={resetState.single.password}
            loginUrl={resetState.loginUrl ?? ""}
            emailSent={resetState.single.emailSent}
            emailError={resetState.single.emailError}
          />
        </div>
      )}

      <EditMemberDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        familyId={familyId}
        member={member}
      />
    </li>
  );
}

function EditMemberDialog({
  open,
  onClose,
  familyId,
  member,
}: {
  open: boolean;
  onClose: () => void;
  familyId: string;
  member: EditMemberRow;
}) {
  const [state, action, pending] = useActionState<
    SuperAdminActionState,
    FormData
  >(updateMemberAction, null);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Updated");
      onClose();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, onClose]);

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit member</DialogTitle>
          <DialogDescription>
            Update <span className="font-medium">{member.email}</span>.
            They can&apos;t change their own role; only you can.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="familyId" value={familyId} />
          <input type="hidden" name="userId" value={member.userId} />

          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={member.name}
              required
              autoComplete="off"
            />
            {fieldError("name") && (
              <p className="text-xs text-destructive">{fieldError("name")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-role">Role</Label>
            <Select name="role" defaultValue={member.role}>
              <SelectTrigger id="edit-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="MEMBER">Member</SelectItem>
              </SelectContent>
            </Select>
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
      </DialogContent>
    </Dialog>
  );
}

// ─── Add a member to this family ────────────────────────────────────────────

function AddMemberForm({ familyId }: { familyId: string }) {
  const [state, action, pending] = useActionState<
    SuperAdminActionState,
    FormData
  >(addMemberAction, null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      if (state.single?.emailSent) toast.success(state.message ?? "Added");
      else toast.warning(state.message ?? "Added — email failed");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <form ref={formRef} action={action} className="space-y-4">
          <input type="hidden" name="familyId" value={familyId} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr_1.4fr_0.8fr]">
            <div>
              <Label htmlFor="new-name" className="sr-only">
                Name
              </Label>
              <Input
                id="new-name"
                name="name"
                placeholder="Name"
                required
                autoComplete="off"
              />
              {fieldError("name") && (
                <p className="mt-1 text-xs text-destructive">{fieldError("name")}</p>
              )}
            </div>
            <div>
              <Label htmlFor="new-email" className="sr-only">
                Email
              </Label>
              <Input
                id="new-email"
                name="email"
                type="email"
                placeholder="email@example.com"
                required
                autoComplete="off"
              />
              {fieldError("email") && (
                <p className="mt-1 text-xs text-destructive">{fieldError("email")}</p>
              )}
            </div>
            <div>
              <Label htmlFor="new-role" className="sr-only">
                Role
              </Label>
              <Select name="role" defaultValue="MEMBER">
                <SelectTrigger id="new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Set custom password (optional)
            </summary>
            <Input
              className="mt-2"
              name="password"
              placeholder="auto-generated when blank"
              minLength={8}
              autoComplete="off"
            />
          </details>

          {state && !state.ok && !state.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              Add member &amp; send credentials
            </Button>
          </div>
        </form>

        {state?.ok && state.single && (
          <SingleCredentialCard
            email={state.single.email}
            password={state.single.password}
            loginUrl={state.loginUrl ?? ""}
            emailSent={state.single.emailSent}
            emailError={state.single.emailError}
          />
        )}
      </CardContent>
    </Card>
  );
}

