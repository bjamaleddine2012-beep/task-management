// Compute per-user stats: streak, totals, achievements.
// Pure read paths, callable from any server component.

import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

// "Streak" = number of consecutive *days*, ending today or yesterday, on
// which the user had at least one task move into COMPLETED status.
//
// We allow ending yesterday so a streak doesn't break the moment midnight
// hits — if you complete one tomorrow, the streak picks up from yesterday.
// If you skip a full day, it resets.
export async function getStreak(userId: string): Promise<number> {
  const sinceDays = 365;
  const since = new Date(Date.now() - sinceDays * DAY_MS);

  const completions = await prisma.task.findMany({
    where: {
      assignedToId: userId,
      status: "COMPLETED",
      reviewedAt: { gte: since, not: null },
    },
    select: { reviewedAt: true },
    orderBy: { reviewedAt: "desc" },
  });
  if (completions.length === 0) return 0;

  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const completedDays = new Set(
    completions
      .map((c) => c.reviewedAt)
      .filter((d): d is Date => d != null)
      .map((d) => dayKey(d)),
  );

  // Start counting from today; if today wasn't done, start from yesterday.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = new Date(today);
  if (!completedDays.has(dayKey(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS);
    if (!completedDays.has(dayKey(cursor))) return 0;
  }

  let streak = 0;
  while (completedDays.has(dayKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

export type UserStats = {
  totalCompleted: number;
  totalOpen: number;
  totalRejected: number;
  points: number;
  streak: number;
  achievements: Achievement[];
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  earned: boolean;
  progress?: { current: number; target: number };
};

const ACHIEVEMENT_DEFS = [
  { id: "first", name: "Getting started", desc: "Complete your first task", emoji: "🎯", needs: { completed: 1 } },
  { id: "ten", name: "Up and running", desc: "Complete 10 tasks", emoji: "🚀", needs: { completed: 10 } },
  { id: "fifty", name: "Half a hundred", desc: "Complete 50 tasks", emoji: "🏆", needs: { completed: 50 } },
  { id: "hundred", name: "Centurion", desc: "Complete 100 tasks", emoji: "💯", needs: { completed: 100 } },
  { id: "streak3", name: "On a roll", desc: "3-day streak", emoji: "🔥", needs: { streak: 3 } },
  { id: "streak7", name: "Full week", desc: "7-day streak", emoji: "🌟", needs: { streak: 7 } },
  { id: "streak30", name: "Unstoppable", desc: "30-day streak", emoji: "⚡️", needs: { streak: 30 } },
  { id: "points100", name: "Saving up", desc: "Earn 100 points", emoji: "💰", needs: { points: 100 } },
  { id: "points500", name: "Treasury", desc: "Earn 500 points", emoji: "🏦", needs: { points: 500 } },
] as const;

export async function getUserStats(userId: string): Promise<UserStats> {
  const [user, completed, open, rejected, streak] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { points: true },
    }),
    prisma.task.count({
      where: { assignedToId: userId, status: "COMPLETED" },
    }),
    prisma.task.count({
      where: {
        assignedToId: userId,
        status: { notIn: ["COMPLETED", "REJECTED"] },
      },
    }),
    prisma.task.count({
      where: { assignedToId: userId, status: "REJECTED" },
    }),
    getStreak(userId),
  ]);
  const points = user?.points ?? 0;

  const achievements: Achievement[] = ACHIEVEMENT_DEFS.map((def) => {
    const target =
      "completed" in def.needs
        ? def.needs.completed
        : "streak" in def.needs
          ? def.needs.streak
          : def.needs.points;
    const current =
      "completed" in def.needs
        ? completed
        : "streak" in def.needs
          ? streak
          : points;
    return {
      id: def.id,
      name: def.name,
      description: def.desc,
      emoji: def.emoji,
      earned: current >= target,
      progress: { current, target },
    };
  });

  return {
    totalCompleted: completed,
    totalOpen: open,
    totalRejected: rejected,
    points,
    streak,
    achievements,
  };
}
