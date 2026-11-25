import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db, writeTx } from "../db";
import { eventOccurrenceStatus, events, users } from "../db/schema";
import { audit } from "../audit";
import { AppError, isUniqueViolation } from "../errors";
import { requireMembersOf, requireMembership } from "../permissions";
import { occurrences, type LocalDate } from "../schedule";
import type { EventInput } from "../validation";

// PRD §7.

export type EventRow = typeof events.$inferSelect;
export type Occurrence = {
  eventId: string; groupId: string; title: string; type: EventRow["type"]; at: string; allDay: boolean;
  location: string | null; assigneeId: string | null; recurring: boolean; status: "scheduled" | "completed" | "cancelled";
};

/** Occurrences for the given groups in [from, to]. Caller must already have checked membership. */
export async function occurrencesForGroups(groupIds: string[], from: LocalDate, to: LocalDate): Promise<Occurrence[]> {
  if (groupIds.length === 0) return [];
  const rows = await db.select().from(events).where(and(
    inArray(events.groupId, groupIds),
    lte(events.startsAt, `${to}T23:59`),
    or(eq(events.recurrence, "none"), isNull(events.recurrenceUntil), gte(events.recurrenceUntil, from)),
  ));
  const relevant = rows.filter((e) => e.recurrence !== "none" || e.startsAt >= `${from}T00:00`);
  if (relevant.length === 0) return [];
  const statuses = await db.select().from(eventOccurrenceStatus).where(inArray(eventOccurrenceStatus.eventId, relevant.map((e) => e.id)));
  const st = new Map(statuses.map((s) => [`${s.eventId}|${s.occurrence}`, s.status]));
  const out: Occurrence[] = [];
  for (const e of relevant) {
    for (const at of occurrences(e.startsAt, e.recurrence, e.recurrenceUntil, from, to)) {
      out.push({
        eventId: e.id, groupId: e.groupId, title: e.title, type: e.type, at, allDay: e.allDay, location: e.location,
        assigneeId: e.assigneeId, recurring: e.recurrence !== "none", status: st.get(`${e.id}|${at}`) ?? "scheduled",
      });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export async function groupOccurrences(userId: string, groupId: string, from: LocalDate, to: LocalDate) {
  await requireMembership(db, userId, groupId);
  return occurrencesForGroups([groupId], from, to);
}

export async function getEvent(userId: string, groupId: string, eventId: string) {
  await requireMembership(db, userId, groupId);
  const row = await db
    .select({ e: events, assigneeName: users.name })
    .from(events)
    .leftJoin(users, eq(users.id, events.assigneeId))
    .where(and(eq(events.id, eventId), eq(events.groupId, groupId)))
    .get();
  if (!row) throw new AppError("not_found");
  const statuses = await db.select().from(eventOccurrenceStatus)
    .where(and(eq(eventOccurrenceStatus.eventId, eventId), eq(eventOccurrenceStatus.groupId, groupId)))
    .orderBy(asc(eventOccurrenceStatus.occurrence));
  return { event: row.e, assigneeName: row.assigneeName, statuses };
}

export async function createEvent(userId: string, groupId: string, input: EventInput) {
  return writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await requireMembersOf(tx, groupId, [input.assigneeId]);
    const [e] = await tx.insert(events).values({ ...input, groupId, createdById: userId }).returning({ id: events.id });
    return e.id;
  });
}

export async function updateEvent(userId: string, groupId: string, eventId: string, input: EventInput) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await requireMembersOf(tx, groupId, [input.assigneeId]);
    const res = await tx.update(events).set({ ...input, updatedAt: new Date() }).where(and(eq(events.id, eventId), eq(events.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
  // Note: editing a recurring event's start keeps statuses of past occurrences that no longer match; they stay in history.
}

export async function deleteEvent(userId: string, groupId: string, eventId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    const [e] = await tx.delete(events).where(and(eq(events.id, eventId), eq(events.groupId, groupId))).returning();
    if (!e) throw new AppError("not_found");
    await audit(tx, { groupId, actorId: userId, action: "event.deleted", meta: { id: e.id, title: e.title, startsAt: e.startsAt } });
  });
}

/** Mark one occurrence completed/cancelled, or clear the mark (null). */
export async function setOccurrenceStatus(userId: string, groupId: string, eventId: string, occurrence: string, status: "completed" | "cancelled" | null) {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(occurrence) || Number.isNaN(Date.parse(`${occurrence}:00Z`))) throw new AppError("invalid_occurrence");
  try {
    await writeTx(async (tx) => {
      await requireMembership(tx, userId, groupId);
      const e = await tx.select().from(events).where(and(eq(events.id, eventId), eq(events.groupId, groupId))).get();
      if (!e) throw new AppError("not_found");
      const d = occurrence.slice(0, 10);
      if (!occurrences(e.startsAt, e.recurrence, e.recurrenceUntil, d, d).includes(occurrence)) throw new AppError("invalid_occurrence");
      await tx.delete(eventOccurrenceStatus).where(and(eq(eventOccurrenceStatus.eventId, eventId), eq(eventOccurrenceStatus.occurrence, occurrence)));
      if (status) await tx.insert(eventOccurrenceStatus).values({ groupId, eventId, occurrence, status, byUserId: userId });
    });
  } catch (e) {
    if (isUniqueViolation(e)) return; // concurrent identical mark
    throw e;
  }
}
