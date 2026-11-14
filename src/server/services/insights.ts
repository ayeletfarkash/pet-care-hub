import { and, desc, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "../db";
import { tasks } from "../db/schema";
import { addDays, nowLocal, todayLocal } from "../schedule";
import { listUserGroups } from "./groups";
import { dosesForGroups } from "./medications";
import { occurrencesForGroups } from "./events";
import { activitiesForGroups } from "./routines";
import { itemsNeedingReorder } from "./inventory";
import { openTasksForGroups } from "./tasks";

// Operational insights (PRD §13): predefined rules over existing data, computed on read (always current,
// no job). Facts and counts only: never a diagnosis or a health recommendation (PRD §13.3, §26).
// Future AI (PRD §13.4) can add rules that return the same Insight shape.

export const INSIGHT_CATEGORIES = ["tasks", "inventory", "medical", "appointments", "routines"] as const;
export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];
export type InsightKind =
  | "overdue_tasks" | "open_tasks" | "struggling_series"
  | "low_stock" | "running_out"
  | "doses_next_day" | "upcoming_treatments"
  | "upcoming_events"
  | "missed_activities";
export type InsightItem = { id: string; title: string; href: string; at?: string | null };
export type Insight = { groupId: string; category: InsightCategory; kind: InsightKind; items: InsightItem[] };

export const SERIES_WINDOW_DAYS = 28, SERIES_SAMPLE = 5, SERIES_THRESHOLD = 3; // "3 of the last 5 in 4 weeks"
export const TREATMENT_DAYS = 30, UPCOMING_DAYS = 7, MISSED_DAYS = 7;
const TREATMENT_TYPES = new Set(["vet", "treatment", "lab_test"]);

type Instance = { status: string; dueAt: string | null; completedAt: Date | null };
/**
 * A recurring task "keeps slipping" when, of its last SERIES_SAMPLE instances due in the past SERIES_WINDOW_DAYS,
 * at least SERIES_THRESHOLD were cancelled, completed after their due time, or are still open and overdue.
 */
export function isStrugglingSeries(instances: Instance[], now = nowLocal()): boolean {
  const since = `${addDays(now.slice(0, 10), -SERIES_WINDOW_DAYS)}T00:00`;
  const recent = instances.filter((i) => i.dueAt && i.dueAt >= since && i.dueAt <= now)
    .sort((a, b) => b.dueAt!.localeCompare(a.dueAt!)).slice(0, SERIES_SAMPLE);
  const slipped = recent.filter((i) =>
    i.status === "cancelled"
    || (i.status === "completed" && i.completedAt && nowLocal(i.completedAt) > i.dueAt!)
    || ((i.status === "new" || i.status === "in_progress") && i.dueAt! < now));
  return slipped.length >= SERIES_THRESHOLD;
}

/** Insights for the user's groups (optionally one group / one category). Scope comes from current memberships only. */
export async function insightsFor(userId: string, filter: { group?: string; category?: InsightCategory } = {}): Promise<Insight[]> {
  const ids = (await listUserGroups(userId)).map((g) => g.groupId).filter((id) => !filter.group || id === filter.group);
  if (ids.length === 0) return [];
  const want = (c: InsightCategory) => !filter.category || filter.category === c;
  const now = nowLocal(), today = todayLocal();
  const out: Insight[] = [];
  const add = (groupId: string, category: InsightCategory, kind: InsightKind, items: InsightItem[]) => { if (items.length) out.push({ groupId, category, kind, items }); };
  const perGroup = <T extends { groupId: string }>(rows: T[], fn: (groupId: string, rows: T[]) => void) => { for (const g of ids) fn(g, rows.filter((r) => r.groupId === g)); };

  const [open, low, doses, occ, acts, recurring] = await Promise.all([
    want("tasks") ? openTasksForGroups(ids) : [],
    want("inventory") ? itemsNeedingReorder(ids) : [],
    want("medical") ? dosesForGroups(ids, today, addDays(today, 1)) : [],
    want("medical") || want("appointments") ? occurrencesForGroups(ids, today, addDays(today, TREATMENT_DAYS)) : [],
    want("routines") ? activitiesForGroups(ids, addDays(today, -MISSED_DAYS), today) : [],
    want("tasks")
      ? db.select({ id: tasks.id, groupId: tasks.groupId, seriesId: tasks.seriesId, title: tasks.title, status: tasks.status, dueAt: tasks.dueAt, completedAt: tasks.completedAt, recurrence: tasks.recurrence })
        .from(tasks).where(and(inArray(tasks.groupId, ids), isNotNull(tasks.dueAt), gte(tasks.dueAt, `${addDays(today, -SERIES_WINDOW_DAYS)}T00:00`), lte(tasks.dueAt, now)))
        .orderBy(desc(tasks.dueAt))
      : [],
  ]);
  const taskHref = (g: string, id: string) => `/groups/${g}/tasks/${id}`;

  perGroup(open, (g, rows) => {
    add(g, "tasks", "overdue_tasks", rows.filter((t) => t.overdue).map((t) => ({ id: t.id, title: t.title, href: taskHref(g, t.id), at: t.dueAt })));
    add(g, "tasks", "open_tasks", rows.filter((t) => !t.overdue).map((t) => ({ id: t.id, title: t.title, href: taskHref(g, t.id), at: t.dueAt })));
  });
  perGroup(recurring.filter((t) => t.recurrence !== "none"), (g, rows) => {
    const bySeries = new Map<string, typeof rows>();
    for (const r of rows) bySeries.set(r.seriesId, [...(bySeries.get(r.seriesId) ?? []), r]);
    add(g, "tasks", "struggling_series", [...bySeries.values()].filter((s) => isStrugglingSeries(s, now))
      .map((s) => ({ id: s[0].seriesId, title: s[0].title, href: taskHref(g, s[0].id) })));
  });
  perGroup(low, (g, rows) => {
    const isLow = (i: (typeof rows)[number]) => i.depleted || (i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold);
    const item = (i: (typeof rows)[number]) => ({ id: i.id, title: i.name, href: `/groups/${g}/inventory/${i.id}`, at: i.runOutDate });
    add(g, "inventory", "low_stock", rows.filter(isLow).map(item));
    add(g, "inventory", "running_out", rows.filter((i) => !isLow(i)).map(item));
  });
  perGroup(doses, (g, rows) => add(g, "medical", "doses_next_day",
    rows.filter((d) => d.status === "due" || d.status === "upcoming").filter((d) => d.scheduledFor <= nowLocal(new Date(Date.now() + 86_400_000)))
      .map((d) => ({ id: `${d.planId}|${d.scheduledFor}`, title: d.name, href: `/groups/${g}/medications/${d.planId}`, at: d.scheduledFor }))));
  perGroup(occ.filter((o) => o.status === "scheduled" && o.at >= (o.allDay ? today : now)), (g, rows) => {
    const item = (o: (typeof rows)[number]) => ({ id: `${o.eventId}|${o.at}`, title: o.title, href: `/groups/${g}/events/${o.eventId}`, at: o.allDay ? o.at.slice(0, 10) : o.at });
    if (want("medical")) add(g, "medical", "upcoming_treatments", rows.filter((o) => TREATMENT_TYPES.has(o.type)).map(item));
    if (want("appointments")) add(g, "appointments", "upcoming_events", rows.filter((o) => o.at.slice(0, 10) <= addDays(today, UPCOMING_DAYS)).map(item));
  });
  perGroup(acts, (g, rows) => add(g, "routines", "missed_activities",
    rows.filter((a) => a.status === "not_logged" || a.status === "missed")
      .map((a) => ({ id: `${a.routineId}|${a.scheduledFor}`, title: a.name, href: `/groups/${g}/routines/${a.routineId}`, at: a.scheduledFor }))));

  const order = (i: Insight) => INSIGHT_CATEGORIES.indexOf(i.category);
  return out.sort((a, b) => order(a) - order(b));
}
