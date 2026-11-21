import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "../db";
import { events, inventoryItems, medicationPlans, memberships, orders, pets, taskAssignees, tasks, users } from "../db/schema";
import { todayLocal } from "../schedule";
import { SEARCH_MIN_CHARS, SEARCH_TYPES, type SearchInput, type SearchType } from "../validation";
import { listUserGroups } from "./groups";
import { rateLimit } from "../rate-limit";

// Global search (PRD §14). Scope = the groups the user belongs to right now, computed here and never taken
// from the request; a group filter can only narrow it. Every query has `group_id IN (scope)`.
// Both roles may read everything in their groups (PRD §3.3), so there is no per-type role filter.
// shortcut: LIKE scans (fine for one household's data); move to FTS when groups hold thousands of rows.

export const SEARCH_LIMIT = 20; // per type
export type SearchResult = { type: SearchType; id: string; groupId: string; title: string; date: string | null; status: string | null };

const OPEN_TASK = ["new", "in_progress"] as const;
const OPEN_ORDER = ["ordered", "processing", "shipped"] as const;

/** Case-insensitive substring match; % and _ typed by the user are literal. */
const contains = (q: string, ...cols: SQLiteColumn[]) => {
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  return or(...cols.map((c) => sql`${c} LIKE ${pattern} ESCAPE '\\'`))!;
};
const inRange = (col: SQLiteColumn, from?: string, to?: string) =>
  and(from ? gte(col, from) : undefined, to ? lte(col, `${to}T23:59`) : undefined);

/** Which types can satisfy the filters (no status/assignee/date on some types). */
function typesFor(f: SearchInput): SearchType[] {
  const withStatus: SearchType[] = ["tasks", "events", "medications", "orders"];
  const withAssignee: SearchType[] = ["tasks", "events", "medications"];
  const withDate: SearchType[] = ["tasks", "events", "medications", "orders"];
  return SEARCH_TYPES.filter((t) =>
    (!f.type || f.type === t) && (!f.status || withStatus.includes(t)) && (!f.assignee || withAssignee.includes(t)) && (!(f.from || f.to) || withDate.includes(t)));
}

export async function searchAll(userId: string, f: SearchInput) {
  const mine = await listUserGroups(userId);
  const scope = mine.map((g) => g.groupId).filter((id) => !f.group || id === f.group);
  const empty = { results: [] as SearchResult[], more: [] as SearchType[] };
  if (f.q.length < SEARCH_MIN_CHARS || scope.length === 0) return empty;
  rateLimit(`search:${userId}`, 60, 60_000); // each search runs up to 6 LIKE scans
  const q = f.q, today = todayLocal(), n = SEARCH_LIMIT + 1;
  const types = new Set(typesFor(f));
  const run = async (t: SearchType, fn: () => Promise<SearchResult[]>) => (types.has(t) ? fn() : []);

  const lists = await Promise.all([
    run("pets", async () => (await db.select({ id: pets.id, groupId: pets.groupId, title: pets.name }).from(pets)
      .where(and(inArray(pets.groupId, scope), contains(q, pets.name, pets.breed))).limit(n))
      .map((r) => ({ ...r, type: "pets" as const, date: null, status: null }))),

    run("tasks", async () => {
      const assigned = f.assignee
        ? (await db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(and(inArray(taskAssignees.groupId, scope), eq(taskAssignees.userId, f.assignee)))).map((r) => r.id)
        : null;
      if (assigned && assigned.length === 0) return [];
      return (await db.select({ id: tasks.id, groupId: tasks.groupId, title: tasks.title, date: tasks.dueAt, status: tasks.status }).from(tasks)
        .where(and(
          inArray(tasks.groupId, scope), contains(q, tasks.title, tasks.description),
          f.status === "open" ? inArray(tasks.status, [...OPEN_TASK]) : f.status === "closed" ? sql`${tasks.status} NOT IN ('new', 'in_progress')` : undefined,
          assigned ? inArray(tasks.id, assigned) : undefined, inRange(tasks.dueAt, f.from, f.to),
        )).orderBy(desc(tasks.createdAt)).limit(n)).map((r) => ({ ...r, type: "tasks" as const }));
    }),

    run("events", async () => {
      // "Open" = still ahead: a future start, or a recurrence that hasn't ended.
      const ahead = or(gte(events.startsAt, today), and(ne(events.recurrence, "none"), or(isNull(events.recurrenceUntil), gte(events.recurrenceUntil, today))));
      return (await db.select({ id: events.id, groupId: events.groupId, title: events.title, date: events.startsAt }).from(events)
        .where(and(
          inArray(events.groupId, scope), contains(q, events.title, events.location, events.provider, events.description),
          f.status === "open" ? ahead : f.status === "closed" ? sql`NOT (${ahead})` : undefined,
          f.assignee ? eq(events.assigneeId, f.assignee) : undefined, inRange(events.startsAt, f.from, f.to),
        )).orderBy(desc(events.startsAt)).limit(n)).map((r) => ({ ...r, type: "events" as const, status: null }));
    }),


    run("medications", async () => {
      const active = or(isNull(medicationPlans.endDate), gte(medicationPlans.endDate, today));
      return (await db.select({ id: medicationPlans.id, groupId: medicationPlans.groupId, title: medicationPlans.name, date: medicationPlans.startDate, endDate: medicationPlans.endDate }).from(medicationPlans)
        .where(and(
          inArray(medicationPlans.groupId, scope), contains(q, medicationPlans.name, medicationPlans.dosage, medicationPlans.instructions, medicationPlans.notes),
          f.status === "open" ? active : f.status === "closed" ? sql`NOT (${active})` : undefined,
          f.assignee ? eq(medicationPlans.responsibleUserId, f.assignee) : undefined, inRange(medicationPlans.startDate, f.from, f.to),
        )).orderBy(asc(medicationPlans.name)).limit(n))
        .map(({ endDate, ...r }) => ({ ...r, type: "medications" as const, status: !endDate || endDate >= today ? "active" : "ended" }));
    }),

    run("products", async () => (await db.select({ id: inventoryItems.id, groupId: inventoryItems.groupId, title: inventoryItems.name }).from(inventoryItems)
      .where(and(inArray(inventoryItems.groupId, scope), contains(q, inventoryItems.name, inventoryItems.brand, inventoryItems.vendor, inventoryItems.notes)))
      .orderBy(asc(inventoryItems.name)).limit(n)).map((r) => ({ ...r, type: "products" as const, date: null, status: null }))),

    run("orders", async () => (await db.select({ id: orders.id, groupId: orders.groupId, title: orders.product, date: orders.orderDate, status: orders.status }).from(orders)
      .where(and(
        inArray(orders.groupId, scope), contains(q, orders.product, orders.vendor, orders.notes),
        f.status === "open" ? inArray(orders.status, [...OPEN_ORDER]) : f.status === "closed" ? inArray(orders.status, ["delivered", "cancelled"]) : undefined,
        inRange(orders.orderDate, f.from, f.to),
      )).orderBy(desc(orders.orderDate)).limit(n)).map((r) => ({ ...r, type: "orders" as const }))),
  ]);

  const more = lists.filter((l) => l.length > SEARCH_LIMIT).map((l) => l[0].type);
  return { results: lists.flatMap((l) => l.slice(0, SEARCH_LIMIT)), more };
}

/** Filter options: the user's groups and the people in them (assignee filter). */
export async function searchFilterOptions(userId: string) {
  const mine = await listUserGroups(userId);
  const people = mine.length
    ? await db.selectDistinct({ id: users.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(inArray(memberships.groupId, mine.map((g) => g.groupId))).orderBy(asc(users.name))
    : [];
  return { groups: mine.map((g) => ({ id: g.groupId, name: g.petName })), people };
}

export const resultHref = (r: Pick<SearchResult, "type" | "id" | "groupId">) => {
  const seg: Record<SearchType, string> = { pets: "", tasks: "tasks", events: "events", medications: "medications", products: "inventory", orders: "orders" };
  return seg[r.type] ? `/groups/${r.groupId}/${seg[r.type]}/${r.id}` : `/groups/${r.groupId}`;
};

