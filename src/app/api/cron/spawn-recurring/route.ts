import { NextResponse } from "next/server";

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

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    spawned,
    skipped,
  });
}
