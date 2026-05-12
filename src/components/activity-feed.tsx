import * as React from "react";

import { Avatar } from "@/components/avatar";
import { prisma } from "@/lib/prisma";

const KIND_LABEL: Record<string, { label: string; tone: string; emoji: string }> = {
  created: { label: "created", tone: "text-foreground", emoji: "📝" },
  edited: { label: "edited", tone: "text-foreground", emoji: "✏️" },
  duplicated: { label: "duplicated", tone: "text-foreground", emoji: "📑" },
  reassigned: { label: "reassigned", tone: "text-foreground", emoji: "↔️" },
  submitted: { label: "submitted proof on", tone: "text-blue-700 dark:text-blue-400", emoji: "📷" },
  approved: { label: "approved", tone: "text-emerald-700 dark:text-emerald-400", emoji: "✅" },
  rejected: { label: "rejected", tone: "text-destructive", emoji: "❌" },
  deleted: { label: "deleted", tone: "text-muted-foreground", emoji: "🗑️" },
  comment: { label: "commented on", tone: "text-foreground", emoji: "💬" },
  status_change: { label: "moved", tone: "text-foreground", emoji: "🔄" },
};

function timeAgo(then: Date, now: Date): string {
  const ms = now.getTime() - then.getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return then.toLocaleDateString();
}

// Server component — fetches recent TaskActivity rows joined with actor +
// task title. Use `limit` for compact widgets (e.g. 5 on dashboard) vs
// the full feed page.
export async function ActivityFeed({
  limit = 20,
  userId,
}: {
  limit?: number;
  // If set, scope to activity where the actor is this user OR the task
  // is assigned to them. Used on personal /profile or user dashboard.
  userId?: string;
}) {
  const where = userId
    ? {
        OR: [
          { actorId: userId },
          { task: { assignedToId: userId } },
        ],
      }
    : {};

  const activities = await prisma.taskActivity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      detail: true,
      createdAt: true,
      actor: {
        select: { name: true, email: true, avatarColor: true, avatarEmoji: true },
      },
      task: { select: { id: true, title: true } },
    },
  });

  if (activities.length === 0) {
    return (
      <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        No activity yet.
      </p>
    );
  }

  const now = new Date();

  return (
    <ul className="space-y-2">
      {activities.map((a) => {
        const meta =
          KIND_LABEL[a.kind] ?? {
            label: a.kind,
            tone: "text-foreground",
            emoji: "•",
          };
        return (
          <li
            key={a.id}
            className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm"
          >
            <span className="mt-0.5 text-lg" aria-hidden>
              {meta.emoji}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {a.actor && (
                  <Avatar
                    name={a.actor.name ?? a.actor.email}
                    emoji={a.actor.avatarEmoji}
                    color={a.actor.avatarColor}
                    size="sm"
                  />
                )}
                <span>
                  <span className="font-medium">
                    {a.actor?.name ?? a.actor?.email ?? "Someone"}
                  </span>{" "}
                  <span className={meta.tone}>{meta.label}</span>{" "}
                  <span className="font-medium">{a.task.title}</span>
                </span>
              </div>
              {a.detail && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.detail}
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {timeAgo(a.createdAt, now)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
