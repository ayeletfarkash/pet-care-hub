import { and, asc, eq } from "drizzle-orm";
import { db, writeTx, type Tx } from "../db";
import { memberships, users, type Role } from "../db/schema";
import { audit } from "../audit";
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
    await audit(tx, { groupId, actorId, action: actorId === targetUserId ? "member.left" : "member.removed", targetUserId });
  });
  // Phase 2+: open tasks/treatments become unassigned here (PRD §4.5); none exist in Phase 1.
}

export async function leaveGroup(userId: string, groupId: string) {
  await writeTx(async (tx) => {
    const role = await requireMembership(tx, userId, groupId);
    if (role === "admin" && (await countAdmins(tx, groupId)) <= 1) throw new AppError("last_admin");
    await tx.delete(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
    await audit(tx, { groupId, actorId: userId, action: "member.left", targetUserId: userId });
  });
}
