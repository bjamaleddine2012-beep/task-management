import Link from "next/link";
import { ArrowRight, ListChecks, Users } from "lucide-react";

import { auth } from "@/auth";
import { ActivityFeed } from "@/components/activity-feed";
import { BadgeUpdater } from "@/components/badge-updater";
import { PushNotifications } from "@/components/push-notifications";
import { getBadgeCount } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const session = await auth();
  const [userCount, adminCount, taskCount, openTaskCount, badgeCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "ADMIN" } }),
      prisma.task.count(),
      prisma.task.count({ where: { status: { not: "COMPLETED" } } }),
      session?.user?.id ? getBadgeCount(session.user.id) : Promise.resolve(0),
    ]);

  const stats = [
    {
      label: "Total users",
      value: userCount,
      sub: `${adminCount} admin${adminCount === 1 ? "" : "s"}`,
      href: "/admin/users",
      icon: Users,
    },
    {
      label: "Tasks",
      value: taskCount,
      sub: `${openTaskCount} open`,
      href: "/admin/tasks",
      icon: ListChecks,
    },
  ];

  return (
    <div className="space-y-8">
      <BadgeUpdater count={badgeCount} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Manage users and assigned work across the team.
        </p>
      </header>

      <PushNotifications />

      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map(({ label, value, sub, href, icon: Icon }) => (
          <Link key={label} href={href} className="group">
            <Card className="transition-shadow group-hover:shadow-md">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className="text-3xl">{value}</CardTitle>
                </div>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{sub}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recent activity
          </h2>
          <Link
            href="/activity"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all →
          </Link>
        </div>
        <ActivityFeed limit={8} />
      </section>
    </div>
  );
}
