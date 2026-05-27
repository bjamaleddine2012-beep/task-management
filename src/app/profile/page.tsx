import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Flame, ListChecks, Trophy } from "lucide-react";

import { auth } from "@/auth";
import { Avatar } from "@/components/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { getUserStats } from "@/lib/stats";
import { centsToDollars } from "@/lib/validators/allowance";

import { ChangePasswordForm } from "./_components/change-password-form";
import { ProfileForm } from "./_components/profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/profile");

  const [user, stats, allowanceAggregate, recentAllowance] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        avatarColor: true,
        avatarEmoji: true,
        quietHoursStart: true,
        quietHoursEnd: true,
        birthday: true,
        passwordHash: true,
        createdAt: true,
      },
    }),
    getUserStats(session.user.id, session.user.activeFamilyId),
    prisma.allowanceEntry.aggregate({
      where: {
        userId: session.user.id,
        // Profile balance is scoped to the user's active family. If they
        // belong to multiple families, each has its own balance.
        familyId: session.user.activeFamilyId,
      },
      _sum: { amountCents: true },
    }),
    prisma.allowanceEntry.findMany({
      where: {
        userId: session.user.id,
        familyId: session.user.activeFamilyId,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, amountCents: true, reason: true, createdAt: true },
    }),
  ]);
  if (!user) redirect("/login");

  const allowanceCents = allowanceAggregate._sum.amountCents ?? 0;
  const fmtAllowanceDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href={session.user.role === "ADMIN" ? "/admin" : "/"}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <header className="mb-8 flex items-center gap-4">
        <Avatar
          name={user.name ?? user.email}
          emoji={user.avatarEmoji}
          color={user.avatarColor}
          size="xl"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {user.name ?? user.email}
          </h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </header>

      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Trophy className="h-5 w-5" />}
          label="Points"
          value={stats.points}
          accent="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          icon={<Flame className="h-5 w-5" />}
          label="Day streak"
          value={stats.streak}
          accent="text-orange-600 dark:text-orange-400"
        />
        <StatCard
          icon={<ListChecks className="h-5 w-5" />}
          label="Tasks completed"
          value={stats.totalCompleted}
          accent="text-emerald-600 dark:text-emerald-400"
        />
      </section>

      {(allowanceCents !== 0 || recentAllowance.length > 0) && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Allowance
          </h2>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Current balance</CardDescription>
              <CardTitle
                className={
                  allowanceCents > 0
                    ? "text-3xl text-emerald-600 dark:text-emerald-400"
                    : allowanceCents < 0
                      ? "text-3xl text-destructive"
                      : "text-3xl"
                }
              >
                {centsToDollars(allowanceCents)}
              </CardTitle>
            </CardHeader>
            {recentAllowance.length > 0 && (
              <CardContent className="pt-0">
                <ul className="divide-y text-sm">
                  {recentAllowance.map((e) => {
                    const positive = e.amountCents > 0;
                    return (
                      <li
                        key={e.id}
                        className="flex items-center justify-between py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{e.reason}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtAllowanceDate.format(e.createdAt)}
                          </p>
                        </div>
                        <span
                          className={
                            "tabular-nums font-medium " +
                            (positive
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-destructive")
                          }
                        >
                          {positive ? "+" : ""}
                          {centsToDollars(e.amountCents)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            )}
          </Card>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Achievements ·{" "}
          {stats.achievements.filter((a) => a.earned).length}/
          {stats.achievements.length}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.achievements.map((a) => (
            <Card
              key={a.id}
              className={
                a.earned
                  ? "border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20"
                  : "opacity-60"
              }
            >
              <CardContent className="space-y-1 p-4 text-center">
                <div className={a.earned ? "text-3xl" : "text-3xl grayscale"}>
                  {a.emoji}
                </div>
                <p className="text-sm font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.description}
                </p>
                {!a.earned && a.progress && (
                  <p className="text-xs text-muted-foreground">
                    {a.progress.current}/{a.progress.target}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Edit profile
        </h2>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <ProfileForm
              defaults={{
                name: user.name ?? "",
                avatarColor: user.avatarColor ?? "",
                avatarEmoji: user.avatarEmoji ?? "",
                quietHoursStart: user.quietHoursStart ?? "",
                quietHoursEnd: user.quietHoursEnd ?? "",
                birthday: user.birthday
                  ? user.birthday.toISOString().slice(0, 10)
                  : "",
              }}
            />
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          {user.passwordHash ? "Change password" : "Set a password"}
        </h2>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <ChangePasswordForm hasPassword={!!user.passwordHash} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className={`flex items-center gap-1.5 ${accent}`}>{icon}</div>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
