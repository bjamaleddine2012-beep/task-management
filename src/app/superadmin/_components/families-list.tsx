"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { KeyRound, Loader2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  deleteFamilyAction,
  regenerateCredentialsAction,
  type SuperAdminActionState,
} from "@/lib/actions/superadmin";
import { SingleCredentialCard } from "./provision-form";

export type FamilyRow = {
  id: string;
  name: string;
  createdAtFormatted: string;
  memberCount: number;
  taskCount: number;
  adminUserId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  // True for the row matching the super-admin's own activeFamilyId.
  // We grey out the delete button on this one and the server action
  // refuses anyway as defense-in-depth.
  isMyActiveFamily: boolean;
};

export function FamiliesList({ families }: { families: FamilyRow[] }) {
  if (families.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No families yet. Create the first one above.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {families.map((f) => (
            <FamilyItem key={f.id} family={f} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function FamilyItem({ family }: { family: FamilyRow }) {
  // Two server actions live on this row — give each its own slot so a
  // reset doesn't blow away the delete button's pending state.
  const [resetState, resetAction, resetting] = useActionState<
    SuperAdminActionState,
    FormData
  >(regenerateCredentialsAction, null);
  const [deletePending, startDelete] = useTransition();

  React.useEffect(() => {
    if (resetState?.ok) {
      if (resetState.single?.emailSent)
        toast.success(resetState.message ?? "Sent");
      else toast.warning(resetState.message ?? "Reset — email failed");
    } else if (resetState && !resetState.ok) {
      toast.error(resetState.error);
    }
  }, [resetState]);

  const onDelete = () => {
    const phrase = family.name;
    const typed = window.prompt(
      `Delete "${family.name}" and EVERYTHING in it (members' family access, tasks, shopping list, allowance — all gone).\n\nThis cannot be undone.\n\nType the family name exactly to confirm:`,
    );
    if (typed === null) return; // cancelled
    if (typed !== phrase) {
      toast.error("Name didn't match — nothing deleted.");
      return;
    }
    startDelete(async () => {
      const fd = new FormData();
      fd.set("familyId", family.id);
      const res = await deleteFamilyAction(null, fd);
      if (res?.ok) toast.success(res.message ?? "Deleted");
      else if (res && !res.ok) toast.error(res.error);
    });
  };

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-medium">{family.name}</p>
            {family.isMyActiveFamily && (
              <Badge variant="outline" className="text-[10px]">
                your active family
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px]">
              <Users className="mr-1 h-3 w-3" />
              {family.memberCount}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {family.taskCount} tasks
            </Badge>
          </div>

          {family.adminEmail ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Admin: <span className="font-medium">{family.adminName ?? "—"}</span>
              {" · "}
              {family.adminEmail}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-muted-foreground">
              No admin yet
            </p>
          )}

          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {family.createdAtFormatted}
          </p>
        </div>

        <div className="flex gap-2">
          {family.adminUserId && (
            <form action={resetAction}>
              <input type="hidden" name="userId" value={family.adminUserId} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={resetting || deletePending}
              >
                {resetting ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-1 h-4 w-4" />
                )}
                Reset &amp; resend
              </Button>
            </form>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={
              deletePending || resetting || family.isMyActiveFamily
            }
            title={
              family.isMyActiveFamily
                ? "Switch to a different family first."
                : "Delete this family and everything in it"
            }
            className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:hover:bg-transparent disabled:hover:text-destructive/50"
          >
            {deletePending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            Delete
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
    </li>
  );
}
