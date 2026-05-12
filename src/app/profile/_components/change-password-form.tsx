"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeOwnPasswordAction,
  type ProfileActionState,
} from "@/lib/actions/profile";

export function ChangePasswordForm({
  hasPassword,
}: {
  hasPassword: boolean;
}) {
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(
    changeOwnPasswordAction,
    null,
  );
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Password changed");
      formRef.current?.reset();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {hasPassword && (
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
          />
          {fieldError("currentPassword") && (
            <p className="text-xs text-destructive">
              {fieldError("currentPassword")}
            </p>
          )}
        </div>
      )}
      {!hasPassword && (
        <input type="hidden" name="currentPassword" value="placeholder" />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">
            {hasPassword ? "New password" : "Set a password"}
          </Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          {fieldError("newPassword") && (
            <p className="text-xs text-destructive">
              {fieldError("newPassword")}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          {fieldError("confirmPassword") && (
            <p className="text-xs text-destructive">
              {fieldError("confirmPassword")}
            </p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        {hasPassword ? "Change password" : "Set password"}
      </Button>

      {!hasPassword && (
        <p className="text-xs text-muted-foreground">
          You signed in with Google. Set a password if you also want to use
          email + password.
        </p>
      )}
    </form>
  );
}
