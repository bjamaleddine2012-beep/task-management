import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { OnboardingForm } from "./_components/onboarding-form";
import { signOut } from "@/auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/onboarding");
  if (session.user.activeFamilyId) redirect("/");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-stretch justify-center px-4 py-10">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {session.user.name ?? session.user.email}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a family to manage tasks together, or paste an invite link
          from someone in your family.
        </p>
      </header>

      <OnboardingForm />

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
        className="mt-6 text-center"
      >
        <button
          type="submit"
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
