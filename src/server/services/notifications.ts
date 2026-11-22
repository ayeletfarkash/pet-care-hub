import { and, desc, eq, gt, inArray, isNull, like, lte } from "drizzle-orm";
import { db, writeTx, type Tx } from "../db";
import {
  events, groups, medicationPlans, NOTIFICATION_CATEGORIES, notificationPreferences, notifications, reminderRuleRecipients,
  reminderRules, routines, tasks, type NotificationCategory, type ReminderSource,
} from "../db/schema";
import { AppError } from "../errors";
import { requireMembersOf, requireMembership } from "../permissions";
import { addMinutesLocal, nowLocal } from "../schedule";
import { SNOOZE_MAX_DAYS, type ReminderRuleInput } from "../validation";

// PRD §12. Personal preferences, per-source recipient rules, and the user's notification inbox.

export const CATEGORY_OF: Record<ReminderSource | "inventory", NotificationCategory> = {
  medication: "medications", event: "events", task: "tasks", routine: "routines", inventory: "inventory",
};
/** How early each source reminds when nobody chose otherwise. */
export const DEFAULT_LEAD: Record<ReminderSource, number> = { medication: 0, event: 60, task: 0, routine: 0 };

// ─────────── Preferences (personal, never affect other members) ───────────
export async function getNotificationPrefs(userId: string): Promise<Record<NotificationCategory, boolean>> {
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.category));
  return Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, !off.has(c)])) as Record<NotificationCategory, boolean>;
}

export async function setNotificationPrefs(userId: string, enabled: NotificationCategory[]) {
  await writeTx(async (tx) => {
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    const off = NOTIFICATION_CATEGORIES.filter((c) => !enabled.includes(c));
    if (off.length) await tx.insert(notificationPreferences).values(off.map((category) => ({ userId, category, enabled: false })));
  });
}

// ─────────── Reminder rules (recipients + lead time per source) ───────────
const SOURCE_TABLE = { medication: medicationPlans, event: events, task: tasks, routine: routines } as const;
/** Who may set reminders: whoever may create that kind of record (PRD §3.3). */
const RULE_ROLE: Record<ReminderSource, "admin" | undefined> = { medication: "admin", routine: "admin", event: undefined, task: undefined };

async function requireSource(ex: Tx | typeof db, groupId: string, type: ReminderSource, sourceId: string) {
  const t = SOURCE_TABLE[type];
  const row = await ex.select({ id: t.id }).from(t).where(and(eq(t.id, sourceId), eq(t.groupId, groupId))).get();
  if (!row) throw new AppError("not_found");
}

export async function getReminderRule(userId: string, groupId: string, type: ReminderSource, sourceId: string) {
  const role = await requireMembership(db, userId, groupId);
  await requireSource(db, groupId, type, sourceId);
  const rule = await db.select().from(reminderRules)
    .where(and(eq(reminderRules.groupId, groupId), eq(reminderRules.sourceType, type), eq(reminderRules.sourceId, sourceId))).get();
  const recipients = rule
    ? (await db.select({ userId: reminderRuleRecipients.userId }).from(reminderRuleRecipients).where(eq(reminderRuleRecipients.ruleId, rule.id))).map((r) => r.userId)
    : [];
  return {
    canEdit: RULE_ROLE[type] !== "admin" || role === "admin",
    leadMinutes: rule?.leadMinutes ?? DEFAULT_LEAD[type],
    remindAt: rule?.remindAt ?? null,
    recipientMode: rule?.recipientMode ?? "responsible",
    recipients,
  };
}

export async function setReminderRule(userId: string, groupId: string, type: ReminderSource, sourceId: string, input: ReminderRuleInput) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, RULE_ROLE[type]);
    await requireSource(tx, groupId, type, sourceId);
    await requireMembersOf(tx, groupId, input.recipients);
    if (input.remindAt && type !== "task") throw new AppError("invalid_input"); // the sweep only handles custom times for tasks
    const [rule] = await tx.insert(reminderRules)
      .values({ groupId, sourceType: type, sourceId, leadMinutes: input.leadMinutes, remindAt: input.remindAt, recipientMode: input.recipientMode, updatedById: userId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [reminderRules.sourceType, reminderRules.sourceId],
        set: { leadMinutes: input.leadMinutes, remindAt: input.remindAt, recipientMode: input.recipientMode, updatedById: userId, updatedAt: new Date() },
      })
      .returning({ id: reminderRules.id });
    await tx.delete(reminderRuleRecipients).where(eq(reminderRuleRecipients.ruleId, rule.id));
    if (input.recipients.length) await tx.insert(reminderRuleRecipients).values(input.recipients.map((u) => ({ ruleId: rule.id, userId: u, groupId })));
  });
}

// ─────────── Inbox ───────────
/** Delivered notifications for this user, only from groups they still belong to (rows are removed on leave). */
const visible = (userId: string) => and(eq(notifications.userId, userId), lte(notifications.deliverAt, nowLocal()), isNull(groups.deletedAt));

export async function listNotifications(userId: string, limit = 100) {
  const rows = await db.select({ n: notifications }).from(notifications)
    .innerJoin(groups, eq(groups.id, notifications.groupId))
    .where(visible(userId)).orderBy(desc(notifications.deliverAt), desc(notifications.createdAt)).limit(limit);
  const list = rows.map((r) => r.n);
  // Lets the inbox offer "Mark as completed" only while the task is still open (PRD §12.4).
  const taskIds = list.filter((n) => n.sourceType === "task").map((n) => n.sourceId);
  const open = taskIds.length
    ? new Set((await db.select({ id: tasks.id }).from(tasks).where(and(inArray(tasks.id, taskIds), inArray(tasks.status, ["new", "in_progress"])))).map((r) => r.id))
    : new Set<string>();
  return list.map((n) => ({ ...n, taskOpen: n.sourceType === "task" && open.has(n.sourceId) }));
}

export async function unreadCount(userId: string) {
  const rows = await db.select({ id: notifications.id }).from(notifications)
    .innerJoin(groups, eq(groups.id, notifications.groupId))
    .where(and(visible(userId), isNull(notifications.readAt))).limit(100);
  return rows.length;
}

/** Mark one (or, without an id, every delivered) notification of this user as read. */
export async function markRead(userId: string, notificationId?: string) {
  await writeTx(async (tx) => {
    await tx.update(notifications).set({ readAt: new Date() }).where(and(
      eq(notifications.userId, userId), isNull(notifications.readAt), lte(notifications.deliverAt, nowLocal()),
      notificationId ? eq(notifications.id, notificationId) : undefined,
    ));
  });
}

/**
 * Snooze (PRD §12.5): marks this notification read and adds a new one for later. Never touches the task,
 * plan or schedule, so a snoozed dose stays due in Today and in the plan's history.
 */
export async function snoozeNotification(userId: string, notificationId: string, until: string) {
  const now = nowLocal();
  if (until <= now || until > addMinutesLocal(now, SNOOZE_MAX_DAYS * 1440)) throw new AppError("invalid_snooze");
  await writeTx(async (tx) => {
    const row = await tx.select({ n: notifications }).from(notifications).innerJoin(groups, eq(groups.id, notifications.groupId))
      .where(and(eq(notifications.id, notificationId), visible(userId))).get();
    if (!row) throw new AppError("not_found");
    const n = row.n;
    await tx.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, n.id));
    const base = n.kind === "snooze" ? n.occurrenceKey.split("@")[0] : n.occurrenceKey;
    // One pending snooze per occurrence: a new snooze replaces the old one (no unbounded rows).
    await tx.delete(notifications).where(and(
      eq(notifications.userId, userId), eq(notifications.sourceType, n.sourceType), eq(notifications.sourceId, n.sourceId),
      eq(notifications.kind, "snooze"), like(notifications.occurrenceKey, `${base}@%`), gt(notifications.deliverAt, now),
    ));
    await tx.insert(notifications).values({
      groupId: n.groupId, userId, category: n.category, sourceType: n.sourceType, sourceId: n.sourceId,
      occurrenceKey: `${base}@${until}`, kind: "snooze", deliverAt: until, params: n.params,
    }).onConflictDoNothing();
  });
}

/** Snoozed notifications still waiting (shown in the inbox as "Snoozed until …"). */
export async function pendingSnoozes(userId: string) {
  return db.select({ id: notifications.id, sourceType: notifications.sourceType, params: notifications.params, deliverAt: notifications.deliverAt })
    .from(notifications).innerJoin(groups, eq(groups.id, notifications.groupId))
    .where(and(eq(notifications.userId, userId), eq(notifications.kind, "snooze"), gt(notifications.deliverAt, nowLocal()), isNull(groups.deletedAt)))
    .orderBy(notifications.deliverAt).limit(50);
}

/** Leaving/removal: the user's rule memberships and notifications in that group go too (same transaction). */
export async function releaseNotifications(tx: Tx, groupId: string, userId: string) {
  await tx.delete(reminderRuleRecipients).where(and(eq(reminderRuleRecipients.groupId, groupId), eq(reminderRuleRecipients.userId, userId)));
  await tx.delete(notifications).where(and(eq(notifications.groupId, groupId), eq(notifications.userId, userId)));
}

export const hrefOf = (n: { groupId: string; sourceType: string; sourceId: string }) => {
  const seg = { medication: "medications", event: "events", task: "tasks", routine: "routines", inventory: "inventory" }[n.sourceType];
  return `/groups/${n.groupId}/${seg}/${n.sourceId}`;
};

