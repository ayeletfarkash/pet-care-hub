import { and, eq, gte, inArray, isNotNull, isNull, lt, lte } from "drizzle-orm";
import { db, writeCount, writeTx } from "../db";
import {
  groups, memberships, notificationPreferences, notifications, pets, reminderRuleRecipients, reminderRules,
  taskAssignees, tasks, type ReminderSource,
} from "../db/schema";
import { addDays, addMinutesLocal, nowLocal } from "../schedule";
import { dosesForGroups } from "./medications";
import { occurrencesForGroups } from "./events";
import { activitiesForGroups } from "./routines";
import { itemsNeedingReorder, restockCycles } from "./inventory";
import { generateAutoTasks } from "./auto-tasks";
import { CATEGORY_OF, DEFAULT_LEAD } from "./notifications";
import { deliverPush } from "./push";

// Background reminder sweep (PRD §12, §21.5). Runs every minute (src/instrumentation.ts) and on the
// inbox page. It computes the occurrences whose reminder time fell in the last LOOKBACK_MINUTES and
// inserts one notification per recipient; the unique index makes every run idempotent, so a missed
// or repeated run neither loses nor duplicates reminders.
// System job: group ids come from the database, never from a request, so there is no requireMembership.

export const LOOKBACK_MINUTES = 6 * 60; // catch-up after downtime; older reminders would only be noise
export const PURGE_AFTER_DAYS = 90;
const ALL_DAY_TIME = "08:00"; // all-day events remind as if they started at 08:00

type Candidate = {
  groupId: string; sourceType: ReminderSource; sourceId: string; at: string; responsible: (string | null)[]; name: string;
};
type Row = typeof notifications.$inferInsert;

export async function sweep(now = new Date()): Promise<number> {
  const to = nowLocal(now), from = nowLocal(new Date(now.getTime() - LOOKBACK_MINUTES * 60_000));
  const live = await db.select({ id: groups.id, pet: pets.name }).from(groups).innerJoin(pets, eq(pets.groupId, groups.id)).where(isNull(groups.deletedAt));
  if (live.length === 0) return 0;
  const ids = live.map((g) => g.id), pet = new Map(live.map((g) => [g.id, g.pet]));
  await generateAutoTasks(ids, now); // first, so a new task can be reminded in this same run

  const [members, off, rules] = await Promise.all([
    db.select({ groupId: memberships.groupId, userId: memberships.userId }).from(memberships).where(inArray(memberships.groupId, ids)),
    db.select().from(notificationPreferences).where(eq(notificationPreferences.enabled, false)),
    db.select().from(reminderRules).where(inArray(reminderRules.groupId, ids)),
  ]);
  const membersOf = new Map<string, string[]>();
  for (const m of members) membersOf.set(m.groupId, [...(membersOf.get(m.groupId) ?? []), m.userId]);
  const disabled = new Set(off.map((p) => `${p.userId}|${p.category}`));
  const picked = rules.length
    ? await db.select().from(reminderRuleRecipients).where(inArray(reminderRuleRecipients.ruleId, rules.map((r) => r.id)))
    : [];
  const ruleOf = new Map(rules.map((r) => [`${r.sourceType}|${r.sourceId}`, { ...r, users: picked.filter((p) => p.ruleId === r.id).map((p) => p.userId) }]));

  // Occurrences up to a day ahead (the longest lead time), still open.
  const dFrom = from.slice(0, 10), dTo = addDays(to.slice(0, 10), 1);
  const [doses, occ, acts, due] = await Promise.all([
    dosesForGroups(ids, dFrom, dTo),
    occurrencesForGroups(ids, dFrom, dTo),
    activitiesForGroups(ids, dFrom, dTo),
    db.select().from(tasks).where(and(
      inArray(tasks.groupId, ids), inArray(tasks.status, ["new", "in_progress"]),
      isNotNull(tasks.dueAt), gte(tasks.dueAt, from), lte(tasks.dueAt, `${dTo}T23:59`),
    )),
  ]);
  const assignees = due.length
    ? await db.select().from(taskAssignees).where(inArray(taskAssignees.taskId, due.map((x) => x.id)))
    : [];
  const candidates: Candidate[] = [
    ...doses.filter((d) => d.status !== "given").map((d) => ({ groupId: d.groupId, sourceType: "medication" as const, sourceId: d.planId, at: d.scheduledFor, responsible: [d.responsibleUserId], name: d.name })),
    ...occ.filter((o) => o.status === "scheduled").map((o) => ({ groupId: o.groupId, sourceType: "event" as const, sourceId: o.eventId, at: o.allDay ? `${o.at.slice(0, 10)}T${ALL_DAY_TIME}` : o.at, responsible: [o.assigneeId], name: o.title })),
    ...acts.filter((a) => a.status !== "completed" && a.status !== "missed").map((a) => ({ groupId: a.groupId, sourceType: "routine" as const, sourceId: a.routineId, at: a.scheduledFor, responsible: [a.responsibleUserId], name: a.name })),
    ...due.map((x) => ({ groupId: x.groupId, sourceType: "task" as const, sourceId: x.id, at: x.dueAt!, responsible: assignees.filter((a) => a.taskId === x.id).map((a) => a.userId), name: x.title })),
  ];

  const rows: Row[] = [];
  const push = (groupId: string, users: string[], r: Omit<Row, "groupId" | "userId" | "category">) => {
    const category = CATEGORY_OF[r.sourceType];
    for (const userId of new Set(users)) if (!disabled.has(`${userId}|${category}`)) rows.push({ ...r, groupId, userId, category });
  };

  for (const c of candidates) {
    const rule = ruleOf.get(`${c.sourceType}|${c.sourceId}`);
    const fireAt = addMinutesLocal(c.at, -(rule?.leadMinutes ?? DEFAULT_LEAD[c.sourceType]));
    if (fireAt <= from || fireAt > to) continue;
    const current = membersOf.get(c.groupId) ?? [];
    const responsible = c.responsible.filter((u): u is string => !!u);
    const wanted = rule?.recipientMode === "all" ? current
      : rule?.recipientMode === "selected" ? rule.users
      : responsible.length ? responsible : current; // nobody responsible → remind everyone rather than no one
    push(c.groupId, wanted.filter((u) => current.includes(u)), {
      sourceType: c.sourceType, sourceId: c.sourceId, occurrenceKey: c.at, deliverAt: fireAt, params: { name: c.name, pet: pet.get(c.groupId) ?? "", at: c.at },
    });
  }

  // Low stock: everyone in the group, once per restock cycle (a new purchase starts a new cycle).
  const low = await itemsNeedingReorder(ids);
  if (low.length) {
    const purchases = await restockCycles(low.map((i) => i.id));
    for (const i of low) {
      push(i.groupId, membersOf.get(i.groupId) ?? [], {
        sourceType: "inventory", sourceId: i.id, occurrenceKey: `restock:${purchases.get(i.id) ?? 0}`, deliverAt: to, params: { name: i.name, pet: pet.get(i.groupId) ?? "" },
      });
    }
  }

  return writeTx(async (tx) => {
    let added = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const res = await tx.insert(notifications).values(rows.slice(i, i + 200)).onConflictDoNothing();
      added += res.rowsAffected;
    }
    await tx.delete(notifications).where(lt(notifications.createdAt, new Date(now.getTime() - PURGE_AFTER_DAYS * 86_400_000)));
    return added;
  });
}

let running: Promise<number> | null = null;
let sweptAt = 0, sweptWrites = -1;
/**
 * Coalesces overlapping runs (timer + page loads) into one. With `ifChanged`, skips when nothing was
 * written since the last run and it is under a minute old, and never runs more than once per 5 s (security review: page loads must not trigger a sweep each).
 */
export function runSweep(opts: { ifChanged?: boolean } = {}): Promise<number> {
  if (!running && opts.ifChanged && Date.now() - sweptAt < (writeCount() === sweptWrites ? 60_000 : 5_000)) return Promise.resolve(0); // at most one page-load sweep per 5 s
  running ??= sweep()
    .then((n) => { void deliverPush().catch((e) => console.error("push delivery failed", e)); return n; }) // network: don't hold up page renders
    .finally(() => { running = null; sweptAt = Date.now(); sweptWrites = writeCount(); });
  return running;
}
