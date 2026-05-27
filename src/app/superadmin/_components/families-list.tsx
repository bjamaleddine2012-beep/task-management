"use client";

import * as React from "react";
import { useActionState } from "react";
import { KeyRound, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  regenerateCredentialsAction,
  type SuperAdminActionState,
} from "@/lib/actions/superadmin";
import { CredentialsCard } from "./provision-form";

export type FamilyRow = {
  id: string;
  name: string;
  createdAtFormatted: string;
  memberCount: number;
  taskCount: number;
  adminUserId: string | null;
  adminName: string | null;
  adminEmail: string | null;
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
  // Each row has its own action state — we don't want regenerating
  // credentials for family A to overwrite the result card on family B.
  const [state, formAction, pending] = useActionState<
    SuperAdminActionState,
    FormData
  >(regenerateCredentialsAction, null);

  React.useEffect(() => {
    if (state?.ok) {
      if (state.emailSent) toast.success(state.message ?? "Sent");
      else toast.warning(state.message ?? "Reset — email failed");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-medium">{family.name}</p>
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
              Admin: <span className="font-medium">{family.adminName ?? "—"}</span>{" "}
              · {family.adminEmail}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground italic">
              No admin yet
            </p>
          )}

          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {family.createdAtFormatted}
          </p>
        </div>

        {family.adminUserId && (
          <form action={formAction}>
            <input type="hidden" name="userId" value={family.adminUserId} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-1 h-4 w-4" />
              )}
              Reset & resend
            </Button>
          </form>
        )}
      </div>

      {state?.ok && state.generatedPassword && (
        <div className="mt-3">
          <CredentialsCard
            email={state.adminEmail ?? ""}
            password={state.generatedPassword}
            loginUrl={state.loginUrl ?? ""}
            emailSent={!!state.emailSent}
            emailError={state.emailError}
          />
        </div>
      )}
    </li>
  );
}
