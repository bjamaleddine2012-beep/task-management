"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  acceptInviteAction,
  createFamilyAction,
  type FamilyActionState,
} from "@/lib/actions/family";

export function OnboardingForm() {
  const router = useRouter();

  // Create-a-family form state.
  const [createState, createAction, creating] = useActionState<
    FamilyActionState,
    FormData
  >(createFamilyAction, null);

  React.useEffect(() => {
    if (createState?.ok) {
      toast.success(createState.message ?? "Family created");
      // Refresh the session so the JWT picks up the new activeFamilyId,
      // then bounce to /admin.
      router.refresh();
      router.push("/admin");
    } else if (createState && !createState.ok) {
      toast.error(createState.error);
    }
  }, [createState, router]);

  // Join-by-token form state.
  const [joinPending, startJoining] = useTransition();
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const onJoin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setJoinError(null);
    const input = (e.currentTarget.elements.namedItem(
      "linkOrToken",
    ) as HTMLInputElement) ?? null;
    const raw = input?.value.trim() ?? "";
    // Accept either the full URL or just the token tail.
    const token = raw.includes("/join/")
      ? raw.split("/join/").pop() ?? ""
      : raw;
    if (!token) {
      setJoinError("Paste your invite link.");
      return;
    }
    startJoining(async () => {
      const fd = new FormData();
      fd.set("token", token);
      const res = await acceptInviteAction(null, fd);
      if (res?.ok) {
        toast.success(res.message ?? "Joined");
        router.refresh();
        router.push("/");
      } else if (res && !res.ok) {
        setJoinError(res.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create a family</CardTitle>
          <CardDescription>
            You'll be the admin. Invite others after this step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAction} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Family name</Label>
              <Input
                id="name"
                name="name"
                placeholder="The Smiths"
                required
                autoFocus
              />
              {createState && !createState.ok && createState.fieldErrors?.name && (
                <p className="text-xs text-destructive">
                  {createState.fieldErrors.name[0]}
                </p>
              )}
            </div>
            <Button type="submit" disabled={creating} className="w-full">
              {creating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Create family
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        OR
        <span className="h-px flex-1 bg-border" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Join an existing family</CardTitle>
          <CardDescription>
            Paste the invite link an admin sent you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onJoin} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="linkOrToken">Invite link</Label>
              <Input
                id="linkOrToken"
                name="linkOrToken"
                placeholder="https://…/join/xxxxx"
                required
              />
              {joinError && (
                <p className="text-xs text-destructive">{joinError}</p>
              )}
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={joinPending}
              className="w-full"
            >
              {joinPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Join family
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
