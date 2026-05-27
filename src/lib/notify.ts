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

// Compute how many items demand this user's attention right now,
// scoped to their currently-active family.
//   Family members: their own non-completed tasks.
//   Family admins: that + every submission awaiting review in the family.
// Used to set the home-screen icon badge (red bubble).
export async function getBadgeCount(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeFamilyId: true },
  });
  if (!user?.activeFamilyId) return 0;

  const familyId = user.activeFamilyId;

  // The session role might be stale; re-read membership to be sure.
  const membership = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId, userId } },
    select: { role: true },
  });
  if (!membership) return 0;

  const myOpen = await prisma.task.count({
    where: {
      familyId,
      assignedToId: userId,
      status: { not: "COMPLETED" },
    },
  });

  if (membership.role !== "ADMIN") return myOpen;

  const toReview = await prisma.task.count({
    where: { familyId, status: "SUBMITTED" },
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

// Notify every ADMIN of the given family. Always pass the familyId
// explicitly — never let this fall back to "all admins" globally, or
// admins of other families would get cross-tenant pings.
export async function notifyFamilyAdmins(
  familyId: string,
  payload: NotificationPayload,
): Promise<void> {
  if (!ensureConfigured()) return;
  const admins = await prisma.familyMember.findMany({
    where: { familyId, role: "ADMIN" },
    select: { userId: true },
  });
  await Promise.all(admins.map((a) => notifyUser(a.userId, payload)));
}

// Legacy name kept for callers that already have a familyId in scope.
// They should call notifyFamilyAdmins; this just forwards.
export async function notifyAdmins(
  payloadOrFamilyId: NotificationPayload | string,
  maybePayload?: NotificationPayload,
): Promise<void> {
  if (typeof payloadOrFamilyId === "string" && maybePayload) {
    return notifyFamilyAdmins(payloadOrFamilyId, maybePayload);
  }
  // No familyId provided — refuse to broadcast globally.
  console.warn(
    "[notify] notifyAdmins called without familyId — refusing to broadcast cross-tenant.",
  );
}
