"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import {
  Check,
  Copy,
  Loader2,
  Plus,
  Trash2,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import type { FamilyRole } from "@prisma/client";

import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  createInviteAction,
  removeFamilyMemberAction,
  revokeInviteAction,
  type FamilyActionState,
} from "@/lib/actions/family";

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  avatarColor: string | null;
  avatarEmoji: string | null;
  role: FamilyRole;
  joinedAtFormatted: string;
  isMe: boolean;
};

export type InviteRow = {
  id: string;
  url: string;
  role: FamilyRole;
  email: string | null;
  expiresAtFormatted: string;
};

export function FamilyAdminView({
  members,
  invites,
}: {
  members: MemberRow[];
  invites: InviteRow[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Members · {members.length}
        </h2>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {members.map((m) => (
                <MemberRowItem key={m.userId} member={m} />
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Send an invite
          </h2>
          <NewInviteCard />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Open invites · {invites.length}
          </h2>
          {invites.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                None yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {invites.map((i) => (
                    <InviteRowItem key={i.id} invite={i} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

function MemberRowItem({ member }: { member: MemberRow }) {
  const [pending, startRemoving] = useTransition();
  const remove = () => {
    if (
      !confirm(
        `Remove ${member.name} from this family? Their account stays; they just lose access to this family's tasks.`,
      )
    )
      return;
    startRemoving(async () => {
      const fd = new FormData();
      fd.set("userId", member.userId);
      const res = await removeFamilyMemberAction(null, fd);
      if (res?.ok) toast.success(res.message ?? "Removed");
      else if (res && !res.ok) toast.error(res.error);
    });
  };

  return (
    <li className="flex items-center gap-3 p-3">
      <Avatar
        name={member.name}
        color={member.avatarColor}
        emoji={member.avatarEmoji}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium">
          {member.name}
          {member.isMe && (
            <span className="text-xs text-muted-foreground">(you)</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        <p className="text-xs text-muted-foreground">
          Joined {member.joinedAtFormatted}
        </p>
      </div>
      <Badge variant={member.role === "ADMIN" ? "default" : "secondary"}>
        {member.role}
      </Badge>
      {!member.isMe && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="Remove"
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserX className="h-4 w-4" />
          )}
        </button>
      )}
    </li>
  );
}

function NewInviteCard() {
  const [state, action, pending] = useActionState<FamilyActionState, FormData>(
    createInviteAction,
    null,
  );
  const [copied, setCopied] = React.useState(false);

  const inviteUrl =
    state && state.ok && state.inviteUrl ? state.inviteUrl : null;

  React.useEffect(() => {
    if (state?.ok && state.inviteUrl) {
      navigator.clipboard?.writeText(state.inviteUrl).catch(() => {});
      setCopied(true);
      toast.success("Invite link copied");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Card>
      <CardContent className="p-4">
        <form action={action} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select name="role" defaultValue="MEMBER">
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">
                Recipient email{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder="optional"
              />
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            Generate invite link
          </Button>
        </form>

        {inviteUrl && (
          <div className="mt-4 rounded-md border bg-muted/30 p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Share this link — single-use, expires in 7 days.
            </p>
            <div className="flex gap-2">
              <Input value={inviteUrl} readOnly className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  toast.success("Copied");
                }}
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InviteRowItem({ invite }: { invite: InviteRow }) {
  const [pending, startRevoking] = useTransition();
  const revoke = () => {
    if (!confirm("Revoke this invite? The link will stop working.")) return;
    startRevoking(async () => {
      const fd = new FormData();
      fd.set("id", invite.id);
      const res = await revokeInviteAction(null, fd);
      if (res?.ok) toast.success("Revoked");
      else if (res && !res.ok) toast.error(res.error);
    });
  };

  return (
    <li className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs">{invite.url}</p>
        <p className="text-xs text-muted-foreground">
          {invite.email ? `${invite.email} · ` : ""}
          Expires {invite.expiresAtFormatted}
        </p>
      </div>
      <Badge variant={invite.role === "ADMIN" ? "default" : "secondary"}>
        {invite.role}
      </Badge>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(invite.url);
          toast.success("Copied");
        }}
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="Copy"
      >
        <Copy className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        aria-label="Revoke"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </li>
  );
}
