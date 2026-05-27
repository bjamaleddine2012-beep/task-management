import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

import { AcceptInviteButton } from "./_components/accept-invite-button";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();

  // Look up the invite first so the page can show family name even
  // before sign-in (improves the "click invite → sign up → join" flow).
  const invite = await prisma.familyInvite.findUnique({
    where: { token },
    select: {
      id: true,
      role: true,
      expiresAt: true,
      usedAt: true,
      family: { select: { name: true } },
    },
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-stretch justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Family invite</CardTitle>
          <CardDescription>
            {invite
              ? `You've been invited to join "${invite.family.name}" as ${
                  invite.role === "ADMIN" ? "an admin" : "a member"
                }.`
              : "This invite is invalid or expired."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!invite && (
            <p className="text-sm text-muted-foreground">
              Ask whoever sent it to share a new one.
            </p>
          )}
          {invite?.usedAt && (
            <p className="text-sm text-destructive">
              This invite has already been accepted.
            </p>
          )}
          {invite && invite.expiresAt < new Date() && !invite.usedAt && (
            <p className="text-sm text-destructive">This invite has expired.</p>
          )}

          {invite &&
            !invite.usedAt &&
            invite.expiresAt >= new Date() &&
            !session?.user && (
              <Button asChild className="w-full">
                <Link href={`/login?callbackUrl=/join/${token}`}>
                  Sign in to accept
                </Link>
              </Button>
            )}

          {invite &&
            !invite.usedAt &&
            invite.expiresAt >= new Date() &&
            session?.user && <AcceptInviteButton token={token} />}
        </CardContent>
      </Card>
    </div>
  );
}
