import { and, asc, eq } from "drizzle-orm";
import { db, writeTx, type Tx } from "../db";
import { events, medicationPlans, memberships, routines, taskAssignees, users } from "../db/schema";
import { audit } from "../audit";
import { releaseNotifications } from "./notifications";
import { AppError } from "../errors";
import { countMembers, requireMembership } from "../permissions";

export async function listMembers(userId: string, groupId: string) {
  await requireMembership(db, userId, groupId);
  return db
    .select({ userId: users.id, name: users.name, email: users.email, joinedAt: memberships.joinedAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.groupId, groupId))
    .orderBy(asc(users.name));
}

// Both run inside an IMMEDIATE transaction, so the member count can't change between check and write.
export async function removeMember(actorId: string, groupId: string, targetUserId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, actorId, groupId);
    const res = await tx.delete(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, targetUserId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
    if ((await countMembers(tx, groupId)) === 0) throw new AppError("last_member"); // rolls the removal back
    await releaseResponsibilities(tx, groupId, targetUserId);
    await audit(tx, { groupId, actorId, action: actorId === targetUserId ? "member.left" : "member.removed", targetUserId });
  });
}

/**
 * PRD §4.5/4.6: when someone leaves or is removed, their open responsibilities in that group become
 * unassigned (history stays; their other groups are untouched). Runs in the same transaction.
 */
async function releaseResponsibilities(tx: Tx, groupId: string, userId: string) {
  await tx.delete(taskAssignees).where(and(eq(taskAssignees.groupId, groupId), eq(taskAssignees.userId, userId)));
  await releaseNotifications(tx, groupId, userId);
  await tx.update(medicationPlans).set({ responsibleUserId: null }).where(and(eq(medicationPlans.groupId, groupId), eq(medicationPlans.responsibleUserId, userId)));
  await tx.update(events).set({ assigneeId: null }).where(and(eq(events.groupId, groupId), eq(events.assigneeId, userId)));
  await tx.update(routines).set({ responsibleUserId: null }).where(and(eq(routines.groupId, groupId), eq(routines.responsibleUserId, userId)));
}

/** What a member is responsible for (shown before leaving/removal). */
export async function responsibilitiesOf(groupId: string, userId: string) {
  const [t, p, e, r] = await Promise.all([
    db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(and(eq(taskAssignees.groupId, groupId), eq(taskAssignees.userId, userId))),
    db.select({ id: medicationPlans.id }).from(medicationPlans).where(and(eq(medicationPlans.groupId, groupId), eq(medicationPlans.responsibleUserId, userId))),
    db.select({ id: events.id }).from(events).where(and(eq(events.groupId, groupId), eq(events.assigneeId, userId))),
    db.select({ id: routines.id }).from(routines).where(and(eq(routines.groupId, groupId), eq(routines.responsibleUserId, userId))),
  ]);
  return { tasks: t.length, plans: p.length, events: e.length, routines: r.length };
}

export async function leaveGroup(userId: string, groupId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    if ((await countMembers(tx, groupId)) <= 1) throw new AppError("last_member");
    await tx.delete(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
    await releaseResponsibilities(tx, groupId, userId);
    await audit(tx, { groupId, actorId: userId, action: "member.left", targetUserId: userId });
  });
}
