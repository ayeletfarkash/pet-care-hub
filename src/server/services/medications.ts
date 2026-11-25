import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, writeTx } from "../db";
import { medicationAdministrations, medicationPlans, users } from "../db/schema";
import { AppError, isUniqueViolation } from "../errors";
import { requireMembersOf, requireMembership } from "../permissions";
import { addDays, isScheduledDose, medicationDoses, nowLocal, todayLocal, type LocalDate } from "../schedule";
import type { MedicationPlanInput } from "../validation";

// PRD §6.3–6.4. Scheduled doses are computed from the plan; an administration row is the only
// proof a dose was given (never inferred from a reminder, PRD §26 rule 10).

export type Plan = typeof medicationPlans.$inferSelect;
export const EARLY_DOSE_MINUTES = 60; // a dose may be confirmed up to an hour before its time

export async function listPlans(userId: string, groupId: string) {
  await requireMembership(db, userId, groupId);
  const plans = await db
    .select({ p: medicationPlans, responsibleName: users.name })
    .from(medicationPlans)
    .leftJoin(users, eq(users.id, medicationPlans.responsibleUserId))
    .where(eq(medicationPlans.groupId, groupId))
    .orderBy(asc(medicationPlans.name));
  const today = todayLocal();
  return { plans: plans.map(({ p, responsibleName }) => ({ ...p, responsibleName, active: !p.endDate || p.endDate >= today })) };
}

export async function getPlan(userId: string, groupId: string, planId: string) {
  await requireMembership(db, userId, groupId);
  const plan = await db.select().from(medicationPlans).where(and(eq(medicationPlans.id, planId), eq(medicationPlans.groupId, groupId))).get();
  if (!plan) throw new AppError("not_found");
  return { plan };
}

export async function createPlan(userId: string, groupId: string, input: MedicationPlanInput) {
  return writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await requireMembersOf(tx, groupId, [input.responsibleUserId]);
    const [p] = await tx.insert(medicationPlans).values({ ...input, groupId, createdById: userId }).returning({ id: medicationPlans.id });
    return p.id;
  });
}

export async function updatePlan(userId: string, groupId: string, planId: string, input: MedicationPlanInput) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await requireMembersOf(tx, groupId, [input.responsibleUserId]);
    const res = await tx.update(medicationPlans).set({ ...input, updatedAt: new Date() })
      .where(and(eq(medicationPlans.id, planId), eq(medicationPlans.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
}

/** Stop a plan from today on, keeping its history. */
export async function endPlan(userId: string, groupId: string, planId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    const p = await tx.select().from(medicationPlans).where(and(eq(medicationPlans.id, planId), eq(medicationPlans.groupId, groupId))).get();
    if (!p) throw new AppError("not_found");
    const today = todayLocal();
    if (!p.endDate || p.endDate > today) await tx.update(medicationPlans).set({ endDate: today < p.startDate ? p.startDate : today, updatedAt: new Date() }).where(eq(medicationPlans.id, planId));
  });
}

/** Only plans without recorded doses can be deleted (the administration history must stay complete). */
export async function deletePlan(userId: string, groupId: string, planId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    const used = await tx.select({ id: medicationAdministrations.id }).from(medicationAdministrations)
      .where(and(eq(medicationAdministrations.planId, planId), eq(medicationAdministrations.groupId, groupId))).limit(1).get();
    if (used) throw new AppError("has_history");
    const res = await tx.delete(medicationPlans).where(and(eq(medicationPlans.id, planId), eq(medicationPlans.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
}

export type DoseStatus = "given" | "missed" | "due" | "upcoming";
export type Dose = {
  planId: string; groupId: string; name: string; dosage: string; instructions: string | null;
  responsibleUserId: string | null; scheduledFor: string; status: DoseStatus;
  given?: { at: string; byName: string | null; notes: string | null; id: string };
};

/** Doses for the given groups in [from, to]. Caller must already have checked membership. */
export async function dosesForGroups(groupIds: string[], from: LocalDate, to: LocalDate, opts: { responsibleUserId?: string } = {}): Promise<Dose[]> {
  if (groupIds.length === 0) return [];
  const plans = await db.select().from(medicationPlans).where(and(
    inArray(medicationPlans.groupId, groupIds),
    lte(medicationPlans.startDate, to),
    opts.responsibleUserId ? eq(medicationPlans.responsibleUserId, opts.responsibleUserId) : undefined,
  ));
  const active = plans.filter((p) => !p.endDate || p.endDate >= from);
  if (active.length === 0) return [];
  const given = await db
    .select({ a: medicationAdministrations, byName: users.name })
    .from(medicationAdministrations)
    .leftJoin(users, eq(users.id, medicationAdministrations.administeredById))
    .where(and(
      inArray(medicationAdministrations.planId, active.map((p) => p.id)),
      gte(medicationAdministrations.scheduledFor, `${from}T00:00`),
      lte(medicationAdministrations.scheduledFor, `${to}T23:59`),
    ));
  const byKey = new Map(given.map((g) => [`${g.a.planId}|${g.a.scheduledFor}`, g]));
  const now = nowLocal();
  const dueWindowEnd = nowLocal(new Date(Date.now() + EARLY_DOSE_MINUTES * 60_000));
  const out: Dose[] = [];
  for (const p of active) {
    for (const at of medicationDoses(p, from, to)) {
      const g = byKey.get(`${p.id}|${at}`);
      out.push({
        planId: p.id, groupId: p.groupId, name: p.name, dosage: p.dosage, instructions: p.instructions,
        responsibleUserId: p.responsibleUserId, scheduledFor: at,
        status: g ? "given" : at < now ? "missed" : at <= dueWindowEnd ? "due" : "upcoming",
        given: g && { at: g.a.administeredAt, byName: g.byName, notes: g.a.notes, id: g.a.id },
      });
    }
  }
  return out.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.name.localeCompare(b.name));
}

export async function groupDoses(userId: string, groupId: string, from: LocalDate, to: LocalDate) {
  await requireMembership(db, userId, groupId);
  return dosesForGroups([groupId], from, to);
}

/** Mark a scheduled dose as given. Rejects invented, future and duplicate doses. */
export async function recordAdministration(userId: string, groupId: string, planId: string, scheduledFor: string, notes?: string | null) {
  try {
    await writeTx(async (tx) => {
      await requireMembership(tx, userId, groupId);
      const p = await tx.select().from(medicationPlans).where(and(eq(medicationPlans.id, planId), eq(medicationPlans.groupId, groupId))).get();
      if (!p) throw new AppError("not_found");
      const latest = nowLocal(new Date(Date.now() + EARLY_DOSE_MINUTES * 60_000));
      if (!isScheduledDose(p, scheduledFor) || scheduledFor > latest) throw new AppError("invalid_dose");
      await tx.insert(medicationAdministrations).values({
        groupId, planId, scheduledFor, administeredAt: nowLocal(), administeredById: userId, notes: notes ?? null,
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("already_administered");
    throw e;
  }
}

/** Correct a mistaken confirmation. */
export async function removeAdministration(userId: string, groupId: string, administrationId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    const res = await tx.delete(medicationAdministrations)
      .where(and(eq(medicationAdministrations.id, administrationId), eq(medicationAdministrations.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
}

/** Complete administration history for a plan, newest first. */
export async function administrationHistory(userId: string, groupId: string, planId: string, limit = 100) {
  await requireMembership(db, userId, groupId);
  return db
    .select({ id: medicationAdministrations.id, scheduledFor: medicationAdministrations.scheduledFor, administeredAt: medicationAdministrations.administeredAt, notes: medicationAdministrations.notes, byName: users.name })
    .from(medicationAdministrations)
    .leftJoin(users, eq(users.id, medicationAdministrations.administeredById))
    .where(and(eq(medicationAdministrations.planId, planId), eq(medicationAdministrations.groupId, groupId)))
    .orderBy(desc(medicationAdministrations.scheduledFor))
    .limit(limit);
}

/** Recent unconfirmed doses (last 7 days) so missed ones surface without scanning all history. */
export const recentWindow = () => ({ from: addDays(todayLocal(), -7), to: todayLocal() });
