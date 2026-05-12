// Send Web Push notifications to a user's registered devices.
//
// Configured from env:
//   VAPID_PRIVATE_KEY        — server-only, identifies us to push services
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY — paired public key, also exposed to client
//   VAPID_SUBJECT            — mailto: or https: URL (required by spec)
//
// Subscriptions live in the PushSubscription table. We send in parallel,
// and clean up subscriptions that the push service has expired.

import webpush from "web-push";

import { prisma } from "@/lib/prisma";

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRV = process.env.VAPID_PRIVATE_KEY;
const SUBJ = process.env.VAPID_SUBJECT;

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!PUB || !PRV || !SUBJ) {
    console.warn("[notify] VAPID keys not set; skipping push send.");
    return false;
  }
  webpush.setVapidDetails(SUBJ, PUB, PRV);
  configured = true;
  return true;
}

export type NotificationPayload = {
  title: string;
  body: string;
  /** URL the notification should open when tapped. Defaults to "/". */
  url?: string;
  /** Coalesce duplicate notifications by tag (e.g. "task:<id>"). */
  tag?: string;
};

// Compute how many items demand this user's attention right now.
//   Regular users: count of their non-completed tasks.
//   Admins: that + count of all submissions awaiting review.
// Used to set the home-screen icon badge (red bubble).
export async function getBadgeCount(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return 0;

  const myOpen = await prisma.task.count({
    where: {
      assignedToId: userId,
      status: { not: "COMPLETED" },
    },
  });

  if (user.role !== "ADMIN") return myOpen;

  const toReview = await prisma.task.count({
    where: { status: "SUBMITTED" },
  });
  return myOpen + toReview;
}

// Returns true if `now` falls inside the user's configured quiet-hours
// window (in their local time, approximated using server UTC). Server
// doesn't know the user's timezone — so quiet hours operate on UTC.
// Good enough for the family use case; a future improvement could
// store IANA timezone on User.
function isInQuietHours(
  now: Date,
  start: string | null,
  end: string | null,
): boolean {
  if (!start || !end) return false;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  // Wrap-around windows (22:00 → 07:00) span midnight.
  if (startMin <= endMin) return cur >= startMin && cur < endMin;
  return cur >= startMin || cur < endMin;
}

export async function notifyUser(
  userId: string,
  payload: NotificationPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  const [user, subs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { quietHoursStart: true, quietHoursEnd: true },
    }),
    prisma.pushSubscription.findMany({ where: { userId } }),
  ]);
  if (!user || subs.length === 0) return;

  // Skip during quiet hours. Badge still updates on next push or open.
  if (isInQuietHours(new Date(), user.quietHoursStart, user.quietHoursEnd)) {
    return;
  }

  // Compute the live badge count so the home-screen icon bubble updates
  // even if the user never opens the app.
  const badge = await getBadgeCount(userId);
  const body = JSON.stringify({ ...payload, badge });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 * 24 }, // 24h
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // 404 / 410 mean the subscription is gone — clean up.
        if (code === 404 || code === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
        } else {
          console.warn("[notify] send failed:", code, (err as Error).message);
        }
      }
    }),
  );
}

export async function notifyAdmins(payload: NotificationPayload): Promise<void> {
  if (!ensureConfigured()) return;
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  await Promise.all(admins.map((a) => notifyUser(a.id, payload)));
}
