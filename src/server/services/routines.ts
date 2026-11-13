import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, writeTx } from "../db";
import { routineLogs, routines, users } from "../db/schema";
import { AppError } from "../errors";
import { requireMembersOf, requireMembership } from "../permissions";
import { isScheduledDose, medicationDoses, nowLocal, todayLocal, type LocalDate } from "../schedule";
import type { RoutineInput } from "../validation";
import { CAREGIVER_BACKFILL_HOURS, EARLY_DOSE_MINUTES } from "./medications";

// PRD §11. Activities are computed from the routine's schedule (same rules as medication plans);
// a log row records each completed or missed activity. Extra unscheduled activities have no
// scheduled time and are always "completed".

export type Routine = typeof routines.$inferSelect;

export async function listRoutines(userId: string, groupId: string) {
  const role = await requireMembership(db, userId, groupId);
  const rows = await db.select({ r: routines, responsibleName: users.name }).from(routines)
    .leftJoin(users, eq(users.id, routines.responsibleUserId))
    .where(eq(routines.groupId, groupId)).orderBy(asc(routines.name));
  const today = todayLocal();
  return { role, routines: rows.map(({ r, responsibleName }) => ({ ...r, responsibleName, active: !r.endDate || r.endDate >= today })) };
}

export async function getRoutine(userId: string, groupId: string, routineId: string) {
  const role = await requireMembership(db, userId, groupId);
  const routine = await db.select().from(routines).where(and(eq(routines.id, routineId), eq(routines.groupId, groupId))).get();
  if (!routine) throw new AppError("not_found");
  return { routine, role };
}

export async function createRoutine(userId: string, groupId: string, input: RoutineInput) {
  return writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    await requireMembersOf(tx, groupId, [input.responsibleUserId]);
    const [r] = await tx.insert(routines).values({ ...input, groupId, createdById: userId }).returning({ id: routines.id });
    return r.id;
  });
}

export async function updateRoutine(userId: string, groupId: string, routineId: string, input: RoutineInput) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    await requireMembersOf(tx, groupId, [input.responsibleUserId]);
    const res = await tx.update(routines).set({ ...input, updatedAt: new Date() }).where(and(eq(routines.id, routineId), eq(routines.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
}

/** Stop a routine from today on, keeping its history. */
export async function endRoutine(userId: string, groupId: string, routineId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    const r = await tx.select().from(routines).where(and(eq(routines.id, routineId), eq(routines.groupId, groupId))).get();
    if (!r) throw new AppError("not_found");
    const today = todayLocal();
    if (!r.endDate || r.endDate > today) await tx.update(routines).set({ endDate: today < r.startDate ? r.startDate : today, updatedAt: new Date() }).where(eq(routines.id, routineId));
  });
}

/** Only routines without logged activities can be deleted (logs would cascade). */
export async function deleteRoutine(userId: string, groupId: string, routineId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    const used = await tx.select({ id: routineLogs.id }).from(routineLogs).where(and(eq(routineLogs.routineId, routineId), eq(routineLogs.groupId, groupId))).limit(1).get();
    if (used) throw new AppError("routine_has_history");
    const res = await tx.delete(routines).where(and(eq(routines.id, routineId), eq(routines.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
}

export type ActivityStatus = "completed" | "missed" | "not_logged" | "due" | "upcoming";
export type Activity = {
  routineId: string; groupId: string; name: string; responsibleUserId: string | null; scheduledFor: string; status: ActivityStatus;
  log?: { id: string; at: string; byName: string | null; notes: string | null };
};

/** Scheduled activities for the given groups in [from, to]. Caller must already have checked membership. */
export async function activitiesForGroups(groupIds: string[], from: LocalDate, to: LocalDate, opts: { responsibleUserId?: string } = {}): Promise<Activity[]> {
  if (groupIds.length === 0) return [];
  const rs = (await db.select().from(routines).where(and(
    inArray(routines.groupId, groupIds),
    lte(routines.startDate, to),
    opts.responsibleUserId ? eq(routines.responsibleUserId, opts.responsibleUserId) : undefined,
  ))).filter((r) => !r.endDate || r.endDate >= from);
  if (rs.length === 0) return [];
  const logs = await db.select({ l: routineLogs, byName: users.name }).from(routineLogs)
    .leftJoin(users, eq(users.id, routineLogs.byUserId))
    .where(and(inArray(routineLogs.routineId, rs.map((r) => r.id)), gte(routineLogs.scheduledFor, `${from}T00:00`), lte(routineLogs.scheduledFor, `${to}T23:59`)));
  const byKey = new Map(logs.map((g) => [`${g.l.routineId}|${g.l.scheduledFor}`, g]));
  const now = nowLocal(), dueEnd = nowLocal(new Date(Date.now() + EARLY_DOSE_MINUTES * 60_000));
  const out: Activity[] = [];
  for (const r of rs) {
    for (const at of medicationDoses(r, from, to)) {
      const g = byKey.get(`${r.id}|${at}`);
      out.push({
        routineId: r.id, groupId: r.groupId, name: r.name, responsibleUserId: r.responsibleUserId, scheduledFor: at,
        status: g ? g.l.status : at < now ? "not_logged" : at <= dueEnd ? "due" : "upcoming",
        log: g && { id: g.l.id, at: g.l.at, byName: g.byName, notes: g.l.notes },
      });
    }
  }
  return out.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.name.localeCompare(b.name));
}

export async function groupActivities(userId: string, groupId: string, from: LocalDate, to: LocalDate) {
  await requireMembership(db, userId, groupId);
  return activitiesForGroups([groupId], from, to);
}

/**
 * Both roles. Logs a scheduled activity as completed or missed (re-logging the same activity
 * updates it, e.g. missed → completed), or an extra activity (`scheduledFor` null, completed only).
 * Scheduled activities must be real occurrences, not in the future; Caregivers can log ≤ 48 h back.
 */
export async function logActivity(userId: string, groupId: string, input: { routineId: string; scheduledFor?: string | null; status: "completed" | "missed"; notes?: string | null }) {
  await writeTx(async (tx) => {
    const role = await requireMembership(tx, userId, groupId);
    const r = await tx.select().from(routines).where(and(eq(routines.id, input.routineId), eq(routines.groupId, groupId))).get();
    if (!r) throw new AppError("not_found");
    const at = nowLocal(), notes = input.notes ?? null;
    if (!input.scheduledFor) {
      if (input.status !== "completed") throw new AppError("invalid_occurrence_log");
      await tx.insert(routineLogs).values({ groupId, routineId: r.id, scheduledFor: null, status: "completed", at, byUserId: userId, notes });
      return;
    }
    const s = input.scheduledFor;
    const latest = nowLocal(new Date(Date.now() + EARLY_DOSE_MINUTES * 60_000));
    const earliest = role === "admin" ? "" : nowLocal(new Date(Date.now() - CAREGIVER_BACKFILL_HOURS * 3_600_000));
    if (!isScheduledDose(r, s) || s > latest || s < earliest) throw new AppError("invalid_occurrence_log");
    await tx.insert(routineLogs).values({ groupId, routineId: r.id, scheduledFor: s, status: input.status, at, byUserId: userId, notes })
      .onConflictDoUpdate({ target: [routineLogs.routineId, routineLogs.scheduledFor], set: { status: input.status, at, byUserId: userId, notes } });
  });
}

/** Correct a mistaken log (Admins only). */
export async function removeLog(userId: string, groupId: string, logId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    const res = await tx.delete(routineLogs).where(and(eq(routineLogs.id, logId), eq(routineLogs.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
}

/** Completed and missed history for a routine, newest first (extras sorted by when they were logged). */
export async function routineHistory(userId: string, groupId: string, routineId: string, limit = 100) {
  await requireMembership(db, userId, groupId);
  const rows = await db
    .select({ id: routineLogs.id, scheduledFor: routineLogs.scheduledFor, status: routineLogs.status, at: routineLogs.at, notes: routineLogs.notes, byName: users.name })
    .from(routineLogs)
    .leftJoin(users, eq(users.id, routineLogs.byUserId))
    .where(and(eq(routineLogs.routineId, routineId), eq(routineLogs.groupId, groupId)))
    .orderBy(desc(sql`coalesce(${routineLogs.scheduledFor}, ${routineLogs.at})`))
    .limit(limit);
  return rows;
}
