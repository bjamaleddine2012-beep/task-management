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

export async function notifyUser(
  userId: string,
  payload: NotificationPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
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
