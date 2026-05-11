"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type PushSubscribeInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
};

// Save (or refresh) a browser push subscription for the current user.
// Idempotent on endpoint.
export async function subscribePushAction(
  input: PushSubscribeInput,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  if (!input?.endpoint || !input?.keys?.p256dh || !input?.keys?.auth) {
    return { ok: false, error: "Invalid subscription payload" };
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: {
      userId: session.user.id,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    },
    create: {
      userId: session.user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    },
  });

  return { ok: true };
}

export async function unsubscribePushAction(
  endpoint: string,
): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };
  await prisma.pushSubscription
    .deleteMany({ where: { endpoint, userId: session.user.id } })
    .catch(() => {});
  return { ok: true };
}
