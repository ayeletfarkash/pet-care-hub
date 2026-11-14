import { and, asc, eq, or } from "drizzle-orm";
import { db, writeTx, type Tx } from "../db";
import { events, medicationPlans, memberships, routines, taskAssignees, taskTransferRequests, users, type Role } from "../db/schema";
import { audit } from "../audit";
import { releaseNotifications } from "./notifications";
import { AppError } from "../errors";
import { countAdmins, requireMembership } from "../permissions";

export async function listMembers(userId: string, groupId: string) {
  await requireMembership(db, userId, groupId);
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, joinedAt: memberships.joinedAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.groupId, groupId))
    .orderBy(asc(users.name));
}

async function targetRole(tx: Tx, groupId: string, targetUserId: string) {
  const row = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, targetUserId)))
    .get();
  if (!row) throw new AppError("not_found");
  return row.role;
}

// All three run inside an IMMEDIATE transaction, so the admin count can't change between check and write.
export async function changeRole(actorId: string, groupId: string, targetUserId: string, role: Role) {
  await writeTx(async (tx) => {
    await requireMembership(tx, actorId, groupId, "admin");
    const current = await targetRole(tx, groupId, targetUserId);
    if (current === role) return;
    if (current === "admin" && (await countAdmins(tx, groupId)) <= 1) throw new AppError("last_admin");
    await tx.update(memberships).set({ role })
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, targetUserId)));
    await audit(tx, { groupId, actorId, action: "member.role_changed", targetUserId, meta: { from: current, to: role } });
  });
}

export async function removeMember(actorId: string, groupId: string, targetUserId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, actorId, groupId, "admin");
    const current = await targetRole(tx, groupId, targetUserId);
    if (current === "admin" && (await countAdmins(tx, groupId)) <= 1) throw new AppError("last_admin");
    await tx.delete(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, targetUserId)));
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
  await tx.update(taskTransferRequests).set({ status: "rejected", decidedAt: new Date() }).where(and(
    eq(taskTransferRequests.groupId, groupId), eq(taskTransferRequests.status, "pending"),
    or(eq(taskTransferRequests.toUserId, userId), eq(taskTransferRequests.requestedById, userId)),
  ));
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
    const role = await requireMembership(tx, userId, groupId);
    if (role === "admin" && (await countAdmins(tx, groupId)) <= 1) throw new AppError("last_admin");
    await tx.delete(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
    await releaseResponsibilities(tx, groupId, userId);
    await audit(tx, { groupId, actorId: userId, action: "member.left", targetUserId: userId });
  });
}
