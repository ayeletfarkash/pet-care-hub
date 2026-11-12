import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { db, writeTx } from "../db";
import { groups, memberships, pets } from "../db/schema";
import { audit } from "../audit";
import { AppError } from "../errors";
import { requireMembership } from "../permissions";
import type { PetInput } from "../validation";

export const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Creates group + pet + creator's admin membership atomically (PRD §2.3). */
export async function createGroupWithPet(userId: string, pet: PetInput) {
  return writeTx(async (tx) => {
    const [group] = await tx.insert(groups).values({}).returning({ id: groups.id });
    await tx.insert(pets).values({ ...pet, groupId: group.id });
    await tx.insert(memberships).values({ groupId: group.id, userId, role: "admin" });
    await audit(tx, { groupId: group.id, actorId: userId, action: "group.created" });
    return group.id;
  });
}

const groupSummary = {
  groupId: groups.id,
  role: memberships.role,
  petName: pets.name,
  species: pets.species,
  speciesOther: pets.speciesOther,
  hasPhoto: pets.photoFile,
  deletedAt: groups.deletedAt,
};

/** Active groups the user belongs to (dashboard). */
export function listUserGroups(userId: string) {
  return db
    .select(groupSummary)
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .innerJoin(pets, eq(pets.groupId, groups.id))
    .where(and(eq(memberships.userId, userId), isNull(groups.deletedAt)))
    .orderBy(asc(pets.name));
}

/** Soft-deleted groups still inside the recovery window where the user is an admin. */
export function listRestorableGroups(userId: string) {
  return db
    .select(groupSummary)
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .innerJoin(pets, eq(pets.groupId, groups.id))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.role, "admin"),
        isNotNull(groups.deletedAt),
        gt(groups.deletedAt, new Date(Date.now() - RESTORE_WINDOW_MS)),
      ),
    );
}

export async function deleteGroup(userId: string, groupId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    await tx.update(groups).set({ deletedAt: new Date(), deletedById: userId }).where(eq(groups.id, groupId));
    await audit(tx, { groupId, actorId: userId, action: "group.deleted" });
  });
}

export async function restoreGroup(userId: string, groupId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin", { includeDeleted: true });
    const g = await tx.select({ deletedAt: groups.deletedAt }).from(groups).where(eq(groups.id, groupId)).get();
    if (!g?.deletedAt) return;
    if (g.deletedAt.getTime() < Date.now() - RESTORE_WINDOW_MS) throw new AppError("restore_expired");
    await tx.update(groups).set({ deletedAt: null, deletedById: null }).where(eq(groups.id, groupId));
    await audit(tx, { groupId, actorId: userId, action: "group.restored" });
  });
}
// shortcut: no purge job yet; groups past the 30-day window stay hidden but are not hard-deleted (PRD §4.7, §21.5).
