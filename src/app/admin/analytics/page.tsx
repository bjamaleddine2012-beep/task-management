import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { getStreak } from "@/lib/stats";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminAnalyticsPage() {
  const now = new Date();
  const last30Cutoff = new Date(now.getTime() - 30 * DAY_MS);

  // Parallelize the read-only aggregations.
  const [
    totals,
    byStatus,
    last30Created,
    last30Completed,
    overdueOpen,
    perUser,
    avgReviewMs,
  ] = await Promise.all([
    prisma.task.count(),
    prisma.task.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.task.count({ where: { createdAt: { gte: last30Cutoff } } }),
    prisma.task.count({
      where: {
        status: "COMPLETED",
        reviewedAt: { gte: last30Cutoff },
      },
    }),
    prisma.task.count({
      where: {
        status: { not: "COMPLETED" },
        dueDate: { lt: now },
      },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        avatarColor: true,
        avatarEmoji: true,
        points: true,
        _count: {
          select: {
            assignedTasks: true,
          },
        },
        assignedTasks: {
          select: {
            status: true,
            dueDate: true,
          },
        },
      },
    }),
    // Average review turnaround in ms (proofSubmittedAt → reviewedAt).
    prisma.$queryRaw<Array<{ avg_ms: number | null }>>`
      SELECT EXTRACT(EPOCH FROM AVG("reviewedAt" - "proofSubmittedAt")) * 1000 AS avg_ms
      FROM "Task"
      WHERE "reviewedAt" IS NOT NULL AND "proofSubmittedAt" IS NOT NULL
    `,
  ]);

  const statusCounts = Object.fromEntries(
    byStatus.map((s) => [s.status, s._count._all]),
  ) as Record<string, number | undefined>;

  const totalDone = statusCounts.COMPLETED ?? 0;
  const totalOpen = totals - totalDone;
  const completionRate = totals > 0 ? Math.round((totalDone / totals) * 100) : 0;

  const avgReviewHours =
    avgReviewMs[0]?.avg_ms != null
      ? Math.round((avgReviewMs[0].avg_ms / 3_600_000) * 10) / 10
      : null;

  const userStats = await Promise.all(
    perUser.map(async (u) => {
      const tasks = u.assignedTasks;
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === "COMPLETED").length;
      const overdue = tasks.filter(
        (t) => t.status !== "COMPLETED" && t.dueDate < now,
      ).length;
      const streak = await getStreak(u.id);
      return {
        id: u.id,
        name: u.name ?? u.email,
        avatarColor: u.avatarColor,
        avatarEmoji: u.avatarEmoji,
        points: u.points,
        streak,
        total,
        done,
        overdue,
        rate: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    }),
  );

  const ranked = {
    byPoints: [...userStats].sort((a, b) => b.points - a.points).slice(0, 5),
    byDone: [...userStats].sort((a, b) => b.done - a.done).slice(0, 5),
    byStreak: [...userStats].sort((a, b) => b.streak - a.streak).slice(0, 5),
  };

  const onlyActive = userStats.filter((u) => u.total > 0).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of activity across the team.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total tasks" value={totals} />
        <Stat label="Open" value={totalOpen} />
        <Stat
          label="Completion rate"
          value={`${completionRate}%`}
          sub={`${totalDone} done`}
        />
        <Stat
          label="Overdue (open)"
          value={overdueOpen}
          tone={overdueOpen > 0 ? "destructive" : undefined}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Created · last 30 d" value={last30Created} />
        <Stat label="Completed · last 30 d" value={last30Completed} />
        <Stat
          label="Avg review turnaround"
          value={avgReviewHours == null ? "—" : `${avgReviewHours}h`}
          sub="Submission → review"
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Status mix
        </h2>
        <Card>
          <CardContent className="space-y-3 p-4">
            {(
              [
                ["PENDING", "Pending"],
                ["IN_PROGRESS", "In progress"],
                ["SUBMITTED", "Awaiting review"],
                ["COMPLETED", "Completed"],
                ["REJECTED", "Rejected"],
              ] as const
            ).map(([key, label]) => {
              const n = statusCounts[key] ?? 0;
              const pct = totals > 0 ? (n / totals) * 100 : 0;
              return (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{n}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={
                        "h-full rounded-full " +
                        (key === "COMPLETED"
                          ? "bg-emerald-500"
                          : key === "REJECTED"
                            ? "bg-destructive"
                            : key === "SUBMITTED"
                              ? "bg-blue-500"
                              : "bg-primary/70")
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Leaderboard · all time
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LeaderCard title="Most points" emoji="🏆" rows={ranked.byPoints.map((u) => ({ user: u, value: u.points, unit: "pts" }))} />
          <LeaderCard title="Most tasks completed" emoji="✅" rows={ranked.byDone.map((u) => ({ user: u, value: u.done, unit: "" }))} />
          <LeaderCard title="Longest active streak" emoji="🔥" rows={ranked.byStreak.map((u) => ({ user: u, value: u.streak, unit: "d" }))} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Per user
        </h2>
        {onlyActive.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No tasks assigned yet.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border bg-background">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Tasks</th>
                  <th className="px-3 py-2 font-medium">Done</th>
                  <th className="px-3 py-2 font-medium">Rate</th>
                  <th className="px-3 py-2 font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {onlyActive.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2 font-medium">{u.name}</td>
                    <td className="px-3 py-2">{u.total}</td>
                    <td className="px-3 py-2">{u.done}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-9 text-right tabular-nums">
                          {u.rate}%
                        </span>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${u.rate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {u.overdue > 0 ? (
                        <Badge variant="destructive">{u.overdue}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "destructive";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            tone === "destructive"
              ? "text-3xl text-destructive"
              : "text-3xl"
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
      {sub && (
        <CardContent className="pt-0 text-xs text-muted-foreground">
          {sub}
        </CardContent>
      )}
    </Card>
  );
}

type LeaderRow = {
  user: {
    id: string;
    name: string;
    avatarColor: string | null;
    avatarEmoji: string | null;
  };
  value: number;
  unit: string;
};

function LeaderCard({
  title,
  emoji,
  rows,
}: {
  title: string;
  emoji: string;
  rows: LeaderRow[];
}) {
  // Filter out anyone tied at 0 so the card doesn't list everyone in
  // small families when nobody has earned anything yet.
  const trimmed = rows.filter((r) => r.value > 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1">
          <span aria-hidden>{emoji}</span> {title}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {trimmed.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No data yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {trimmed.map((r, i) => (
              <li key={r.user.id} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-center text-xs font-medium text-muted-foreground">
                  {i + 1}
                </span>
                <Avatar
                  name={r.user.name}
                  emoji={r.user.avatarEmoji}
                  color={r.user.avatarColor}
                  size="sm"
                />
                <span className="flex-1 truncate text-sm">{r.user.name}</span>
                <span className="tabular-nums text-sm font-medium">
                  {r.value}
                  {r.unit && (
                    <span className="ml-0.5 text-xs text-muted-foreground">
                      {r.unit}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
