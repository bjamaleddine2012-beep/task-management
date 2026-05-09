"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import type { Role } from "@prisma/client";

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
  deleteUserAction,
  resetPasswordAction,
  updateUserAction,
  type ActionState,
} from "@/lib/actions/users";

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  image: string | null;
  createdAtFormatted: string;
  hasPassword: boolean;
  _count: { assignedTasks: number };
};

type DialogKind = "edit" | "reset" | "delete" | null;

export function UsersTable({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const [openFor, setOpenFor] = React.useState<{
    user: AdminUserRow;
    kind: DialogKind;
  } | null>(null);

  const close = () => setOpenFor(null);

  if (users.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-12 text-center text-sm text-muted-foreground">
        No users yet.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const isMe = u.id === currentUserId;
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {u.name ?? "—"}
                      {isMe && (
                        <span className="text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={u.role === "ADMIN" ? "default" : "secondary"}
                    >
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.hasPassword ? "Email + password" : "Google only"}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {u.createdAtFormatted}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowMenu
                      onEdit={() => setOpenFor({ user: u, kind: "edit" })}
                      onResetPassword={() =>
                        setOpenFor({ user: u, kind: "reset" })
                      }
                      onDelete={() => setOpenFor({ user: u, kind: "delete" })}
                      disableDelete={isMe}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <EditUserDialog
        user={openFor?.kind === "edit" ? openFor.user : null}
        onClose={close}
      />
      <ResetPasswordDialog
        user={openFor?.kind === "reset" ? openFor.user : null}
        onClose={close}
      />
      <DeleteUserDialog
        user={openFor?.kind === "delete" ? openFor.user : null}
        onClose={close}
      />
    </>
  );
}

// ─── Row menu (inline; AlertDialog-free for fewer deps) ─────────────────────

function RowMenu({
  onEdit,
  onResetPassword,
  onDelete,
  disableDelete,
}: {
  onEdit: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
  disableDelete?: boolean;
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
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border bg-popover p-1 text-sm shadow-md">
          <MenuButton onClick={onEdit}>Edit</MenuButton>
          <MenuButton onClick={onResetPassword}>Reset password</MenuButton>
          <MenuButton
            onClick={onDelete}
            disabled={disableDelete}
            destructive
          >
            Delete
          </MenuButton>
        </div>
      )}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={
        "block w-full rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 " +
        (destructive ? "text-destructive hover:bg-destructive/10" : "")
      }
    >
      {children}
    </button>
  );
}

// ─── Edit dialog ────────────────────────────────────────────────────────────

function EditUserDialog({
  user,
  onClose,
}: {
  user: AdminUserRow | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateUserAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update the display name or role for{" "}
            <span className="font-medium">{user?.email}</span>.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />

            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                name="name"
                defaultValue={user.name ?? ""}
                required
              />
              {fieldError("name") && (
                <p className="text-xs text-destructive">{fieldError("name")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Role</Label>
              <Select name="role" defaultValue={user.role}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">User</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
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
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset password ────────────────────────────────────────────────────────

function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: AdminUserRow | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    resetPasswordAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for{" "}
            <span className="font-medium">{user?.email}</span>. The user will
            need to sign in with the new password.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />

            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
              {state && !state.ok && state.fieldErrors?.password?.[0] && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.password[0]}
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
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Reset password
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete dialog ─────────────────────────────────────────────────────────

function DeleteUserDialog({
  user,
  onClose,
}: {
  user: AdminUserRow | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteUserAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user</DialogTitle>
          <DialogDescription>
            This permanently removes{" "}
            <span className="font-medium">{user?.email}</span>
            {user && user._count.assignedTasks > 0
              ? ` and their ${user._count.assignedTasks} assigned task${
                  user._count.assignedTasks === 1 ? "" : "s"
                }.`
              : "."}{" "}
            This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />

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
                Delete user
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
