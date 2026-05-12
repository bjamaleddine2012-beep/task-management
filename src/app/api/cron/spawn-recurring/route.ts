import { NextResponse } from "next/server";

import { notifyAdmins, notifyUser } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

// Vercel Cron hits this hourly (see vercel.json). For each active template
// with intervalDays > 0, it spawns a new Task if `lastSpawnedAt + intervalDays`
// is in the past (or it's never run).
//
// Vercel signs cron requests with a header `Authorization: Bearer <CRON_SECRET>`.
// We accept the request only when:
//   1. CRON_SECRET env var is set AND the header matches, OR
//   2. CRON_SECRET is unset (developer convenience for local manual triggers).
//
// Set CRON_SECRET to a random string in your Vercel env to lock this down.

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = request.headers.get("authorization");
    if (got !== `Bearer ${expected}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  const templates = await prisma.taskTemplate.findMany({
    where: {
      active: true,
      intervalDays: { not: null, gt: 0 },
    },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      subtasks: true,
      defaultAssigneeId: true,
      intervalDays: true,
      dueHourLocal: true,
      lastSpawnedAt: true,
      createdById: true,
    },
  });

  const spawned: string[] = [];
  const skipped: string[] = [];

  for (const tpl of templates) {
    if (!tpl.intervalDays) continue;
    if (!tpl.defaultAssigneeId) {
      // No default assignee → can't spawn unattended.
      skipped.push(tpl.id);
      continue;
    }

    const due = new Date(now);
    due.setHours(tpl.dueHourLocal ?? 17, 0, 0, 0);

    // First run: spawn immediately. Subsequent: only if the interval has
    // elapsed since last spawn.
    if (tpl.lastSpawnedAt) {
      const elapsed = now.getTime() - tpl.lastSpawnedAt.getTime();
      if (elapsed < tpl.intervalDays * dayMs) {
        skipped.push(tpl.id);
        continue;
      }
    }

    const subtaskTitles = (tpl.subtasks ?? "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    await prisma.$transaction([
      prisma.task.create({
        data: {
          title: tpl.title,
          description: tpl.description,
          priority: tpl.priority,
          dueDate: due,
          assignedToId: tpl.defaultAssigneeId,
          createdById: tpl.createdById,
          fromTemplateId: tpl.id,
          subtasks:
            subtaskTitles.length > 0
              ? {
                  create: subtaskTitles.map((title, i) => ({
                    title,
                    position: i,
                  })),
                }
              : undefined,
        },
      }),
      prisma.taskTemplate.update({
        where: { id: tpl.id },
        data: { lastSpawnedAt: now },
      }),
    ]);

    spawned.push(tpl.id);
  }

  // Birthday reminders — piggyback on the same daily cron since Hobby
  // only allows one run per day. Fires on the day itself; the result
  // returns counts so the cron log shows what happened.
  const birthdayNotifications = await checkBirthdays(now);

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    spawned,
    skipped,
    birthdayNotifications,
  });
}

// Notify admins (and the birthday person themselves) when today is
// someone's birthday. We match on month + day, ignoring year.
async function checkBirthdays(now: Date): Promise<number> {
  const month = now.getUTCMonth() + 1; // 1-12
  const day = now.getUTCDate();

  // Postgres EXTRACT works on the birthday timestamp column.
  const todays = await prisma.$queryRaw<
    Array<{ id: string; name: string | null; email: string }>
  >`
    SELECT id, name, email
    FROM "User"
    WHERE birthday IS NOT NULL
      AND EXTRACT(MONTH FROM birthday) = ${month}
      AND EXTRACT(DAY FROM birthday) = ${day}
  `;

  if (todays.length === 0) return 0;

  let count = 0;
  for (const u of todays) {
    const name = u.name ?? u.email;
    // Tell admins.
    void notifyAdmins({
      title: `🎂 It's ${name}'s birthday today!`,
      body: "Don't forget to wish them.",
      url: "/",
      tag: `birthday:${u.id}:${now.toISOString().slice(0, 10)}`,
    });
    // Tell the person.
    void notifyUser(u.id, {
      title: "🎉 Happy birthday!",
      body: "Hope you have a great day.",
      url: "/",
      tag: `birthday-self:${now.toISOString().slice(0, 10)}`,
    });
    count++;
  }
  return count;
}
