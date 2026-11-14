import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db, writeTx } from "../db";
import { events, memberships, orders, taskAssignees, taskHistory, tasks, users, type Locale } from "../db/schema";
import { dictionaries, fmt } from "../../i18n";
import { addDays, addMinutesLocal, nowLocal } from "../schedule";
import { occurrencesForGroups } from "./events";
import { itemsNeedingReorder, restockCycles } from "./inventory";

// Automatic task creation (PRD §10.6), run by the reminder sweep. Each task has a source_key and a
// partial UNIQUE(group_id, source_key), so however often this runs a task is created at most once.
// Doses get no tasks: they are already computed, shown in Today and reminded (architecture.md, Phase 4).
// System job: group ids come from the database (see reminders.ts).

export const PREP_LEAD_MINUTES = 24 * 60; // preparation task appears a day before the appointment
export const FOLLOWUP_WINDOW_MINUTES = 24 * 60; // follow-up task is created within a day after it
const OPEN_ORDER = ["ordered", "processing", "shipped"] as const;

type NewTask = {
  groupId: string; title: string; description: string; dueAt: string | null;
  sourceType: "inventory" | "event"; sourceId: string; sourceKey: string; assignee: string | null;
};

export async function generateAutoTasks(groupIds: string[], now = new Date()): Promise<number> {
  if (groupIds.length === 0) return 0;
  const nowL = nowLocal(now);
  // Task text is stored, so it is written in the language of the group's first Admin.
  const admins = await db.select({ groupId: memberships.groupId, locale: users.locale }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(inArray(memberships.groupId, groupIds), eq(memberships.role, "admin"))).orderBy(asc(memberships.joinedAt));
  const localeOf = new Map<string, Locale>();
  for (const a of admins) if (!localeOf.has(a.groupId)) localeOf.set(a.groupId, a.locale);
  const text = (gid: string) => dictionaries[localeOf.get(gid) ?? "he"].tasks.auto;
  const out: NewTask[] = [];

  // Low stock → one unassigned "Reorder" task per restock cycle, unless an order or a reorder task is already open.
  const low = await itemsNeedingReorder(groupIds);
  if (low.length) {
    const ids = low.map((i) => i.id);
    const [cycles, openOrders, openTasks] = await Promise.all([
      restockCycles(ids),
      db.select({ itemId: orders.itemId }).from(orders).where(and(inArray(orders.itemId, ids), inArray(orders.status, [...OPEN_ORDER]))),
      db.select({ itemId: tasks.sourceId }).from(tasks).where(and(eq(tasks.sourceType, "inventory"), inArray(tasks.groupId, groupIds), inArray(tasks.sourceId, ids), inArray(tasks.status, ["new", "in_progress"]))),
    ]);
    const busy = new Set([...openOrders, ...openTasks].map((r) => r.itemId));
    for (const i of low) {
      if (busy.has(i.id)) continue;
      const k = text(i.groupId);
      out.push({
        groupId: i.groupId, title: fmt(k.reorder, { name: i.name }), description: k.reorderNote, dueAt: null,
        sourceType: "inventory", sourceId: i.id, sourceKey: `reorder:${i.id}:${cycles.get(i.id) ?? 0}`, assignee: null,
      });
    }
  }

  // Appointments that opted in → preparation task a day before, follow-up task after (assigned like the event).
  const flagged = await db.select({ id: events.id, groupId: events.groupId, autoPrep: events.autoPrep, autoFollowup: events.autoFollowup })
    .from(events).where(and(inArray(events.groupId, groupIds), or(eq(events.autoPrep, true), eq(events.autoFollowup, true))));
  if (flagged.length) {
    const flags = new Map(flagged.map((e) => [e.id, e]));
    const today = nowL.slice(0, 10);
    const occ = await occurrencesForGroups([...new Set(flagged.map((e) => e.groupId))], addDays(today, -1), addDays(today, 1));
    for (const o of occ) {
      const f = flags.get(o.eventId);
      if (!f || o.status === "cancelled") continue;
      const at = o.allDay ? `${o.at.slice(0, 10)}T08:00` : o.at, k = text(o.groupId);
      if (f.autoPrep && o.status === "scheduled" && addMinutesLocal(at, -PREP_LEAD_MINUTES) <= nowL && at > nowL) {
        out.push({
          groupId: o.groupId, title: fmt(k.prep, { name: o.title }), description: k.prepNote, dueAt: at,
          sourceType: "event", sourceId: o.eventId, sourceKey: `event:${o.eventId}:${o.at}:prep`, assignee: o.assigneeId,
        });
      }
      if (f.autoFollowup && at <= nowL && at > addMinutesLocal(nowL, -FOLLOWUP_WINDOW_MINUTES)) {
        out.push({
          groupId: o.groupId, title: fmt(k.followup, { name: o.title }), description: k.followupNote, dueAt: `${addDays(at.slice(0, 10), 1)}T23:59`,
          sourceType: "event", sourceId: o.eventId, sourceKey: `event:${o.eventId}:${o.at}:followup`, assignee: o.assigneeId,
        });
      }
    }
  }
  if (out.length === 0) return 0;
  // Assignees must still be members (leaving already clears event assignees; this guards any other path).
  const members = new Set((await db.select({ g: memberships.groupId, u: memberships.userId }).from(memberships).where(inArray(memberships.groupId, groupIds))).map((m) => `${m.g}|${m.u}`));

  return writeTx(async (t) => {
    let created = 0;
    for (const { assignee, ...n } of out) {
      const [row] = await t.insert(tasks).values({ ...n, seriesId: crypto.randomUUID() }).onConflictDoNothing().returning({ id: tasks.id });
      if (!row) continue; // already generated earlier
      created++;
      if (assignee && members.has(`${n.groupId}|${assignee}`)) await t.insert(taskAssignees).values({ taskId: row.id, userId: assignee, groupId: n.groupId });
      await t.insert(taskHistory).values({ groupId: n.groupId, taskId: row.id, actorId: null, action: "auto_created" });
    }
    return created;
  });
}
