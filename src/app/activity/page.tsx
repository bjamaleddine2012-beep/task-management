import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ActivityFeed } from "@/components/activity-feed";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/activity");

  const familyId = session.user.activeFamilyId;
  if (!familyId) redirect("/onboarding");

  // Admins see everything in the family; users see only their own slice.
  const scopedUserId =
    session.user.role === "ADMIN" ? undefined : session.user.id;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          {scopedUserId
            ? "Recent activity on tasks involving you."
            : "Everything happening across the family."}
        </p>
      </header>
      <ActivityFeed limit={100} familyId={familyId} userId={scopedUserId} />
    </div>
  );
}
