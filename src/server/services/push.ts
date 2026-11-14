import webpush from "web-push";
import { and, eq, gt, inArray, isNull, lte, notInArray } from "drizzle-orm";
import { db, writeTx } from "../db";
import { groups, notifications, pushSubscriptions, users } from "../db/schema";
import { dictionaries, fmt } from "../../i18n";
import { nowLocal } from "../schedule";
import type { PushSubscriptionInput } from "../validation";

// Web Push (PRD §12.3). Optional: without VAPID keys in the environment nothing is sent and the inbox
// remains the only channel. Payloads name the pet but not the medication/task (they show on lock screens).

export const PUSH_MAX_AGE_MINUTES = 30; // don't push stale reminders (e.g. after downtime)
const MAX_SUBSCRIPTIONS = 10; // per user

export const vapidPublicKey = () => (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null);

export async function saveSubscription(userId: string, sub: PushSubscriptionInput) {
  await writeTx(async (tx) => {
    // An endpoint belongs to one browser; if another account used this browser before, it moves to this user.
    await tx.insert(pushSubscriptions).values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, createdAt: new Date() } });
    const keep = (await tx.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
      .orderBy(pushSubscriptions.createdAt)).map((r) => r.id).slice(-MAX_SUBSCRIPTIONS);
    await tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), notInArray(pushSubscriptions.id, keep)));
  });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await writeTx((tx) => tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))));
}

const SEND_BATCH = 20, SEND_TIMEOUT_MS = 10_000;
let pushing: Promise<number> | null = null;

/** Push newly delivered, unread notifications once each. Called after every sweep; never blocks a page. Overlapping calls share one run. */
export function deliverPush(now = new Date()): Promise<number> {
  pushing ??= pushDue(now).finally(() => { pushing = null; });
  return pushing;
}

async function pushDue(now: Date): Promise<number> {
  const pub = vapidPublicKey();
  if (!pub) return 0;
  const to = nowLocal(now), from = nowLocal(new Date(now.getTime() - PUSH_MAX_AGE_MINUTES * 60_000));
  const due = await db.select({ n: notifications, locale: users.locale }).from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId)).innerJoin(groups, eq(groups.id, notifications.groupId))
    .where(and(isNull(notifications.pushedAt), isNull(notifications.readAt), isNull(groups.deletedAt), lte(notifications.deliverAt, to), gt(notifications.deliverAt, from)))
    .limit(500);
  if (due.length === 0) return 0;
  // Claim first (at most once): a crash mid-send loses a push, never duplicates one; the inbox still has it.
  await writeTx((tx) => tx.update(notifications).set({ pushedAt: now }).where(inArray(notifications.id, due.map((d) => d.n.id))));
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, [...new Set(due.map((d) => d.n.userId))]));
  if (subs.length === 0) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@localhost", pub, process.env.VAPID_PRIVATE_KEY!);
  const gone: string[] = [];
  let sent = 0;
  const jobs = due.flatMap(({ n, locale }) => {
    const t = dictionaries[locale];
    const payload = JSON.stringify({ title: t.app.name, body: fmt(t.notifications.pushKinds[n.sourceType], { pet: n.params.pet }), url: "/notifications", tag: n.id });
    return subs.filter((s) => s.userId === n.userId).map((s) => () =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: PUSH_MAX_AGE_MINUTES * 60, timeout: SEND_TIMEOUT_MS })
        .then(() => { sent++; })
        .catch((e: { statusCode?: number }) => {
          if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.id); // subscription expired or revoked
          else console.error("push failed", e.statusCode ?? "network error");
        }));
  });
  for (let i = 0; i < jobs.length; i += SEND_BATCH) await Promise.all(jobs.slice(i, i + SEND_BATCH).map((run) => run())); // bounded concurrency
  if (gone.length) await writeTx((tx) => tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone)));
  return sent;
}
