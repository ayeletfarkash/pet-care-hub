import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db, writeTx } from "../db";
import { groups, invitations, memberships, pets, users } from "../db/schema";
import { audit } from "../audit";
import { AppError } from "../errors";
import { requireMembership } from "../permissions";
import { hashToken, newToken } from "../tokens";
import type { InvitationInput } from "../validation";

const DAY = 24 * 60 * 60 * 1000;

/** Returns the raw token once; only its hash is stored. */
export async function createInvitation(actorId: string, groupId: string, input: InvitationInput) {
  const token = newToken();
  await writeTx(async (tx) => {
    await requireMembership(tx, actorId, groupId, "admin");
    const [inv] = await tx
      .insert(invitations)
      .values({
        groupId,
        tokenHash: hashToken(token),
        role: input.role,
        email: input.email ?? null,
        reusable: input.email ? false : input.reusable, // email invites are always single-use
        expiresAt: new Date(Date.now() + input.expiresInDays * DAY),
        createdById: actorId,
      })
      .returning({ id: invitations.id });
    await audit(tx, {
      groupId, actorId, action: "invitation.created",
      meta: { invitationId: inv.id, role: input.role, reusable: input.reusable, byEmail: !!input.email },
    });
  });
  return token;
}

/** Active (usable) invitations for the members page. */
export async function listActiveInvitations(actorId: string, groupId: string) {
  await requireMembership(db, actorId, groupId, "admin");
  return db
    .select({
      id: invitations.id, role: invitations.role, email: invitations.email, reusable: invitations.reusable,
      useCount: invitations.useCount, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.groupId, groupId),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
        or(eq(invitations.reusable, true), eq(invitations.useCount, 0)),
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

export async function revokeInvitation(actorId: string, groupId: string, invitationId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, actorId, groupId, "admin");
    const res = await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, invitationId), eq(invitations.groupId, groupId), isNull(invitations.revokedAt)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
    await audit(tx, { groupId, actorId, action: "invitation.revoked", meta: { invitationId } });
  });
}

const usable = () =>
  and(
    isNull(invitations.revokedAt),
    gt(invitations.expiresAt, new Date()),
    or(eq(invitations.reusable, true), eq(invitations.useCount, 0)),
    isNull(groups.deletedAt),
  );

/** Public preview for the join page. Any failure -> null (no hint why). */
export async function previewInvitation(token: string) {
  const row = await db
    .select({ petName: pets.name, species: pets.species, role: invitations.role, email: invitations.email, groupId: invitations.groupId })
    .from(invitations)
    .innerJoin(groups, eq(groups.id, invitations.groupId))
    .innerJoin(pets, eq(pets.groupId, groups.id))
    .where(and(eq(invitations.tokenHash, hashToken(token)), usable()))
    .get();
  return row ?? null;
}

/** Consumes the invitation and adds the membership atomically. Returns the group id. */
export async function acceptInvitation(userId: string, token: string) {
  return writeTx(async (tx) => {
    const inv = await tx
      .select({ id: invitations.id, groupId: invitations.groupId, role: invitations.role, email: invitations.email })
      .from(invitations)
      .innerJoin(groups, eq(groups.id, invitations.groupId))
      .where(and(eq(invitations.tokenHash, hashToken(token)), usable()))
      .get();
    if (!inv) throw new AppError("invite_invalid");

    if (inv.email) {
      const u = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).get();
      if (u?.email !== inv.email) throw new AppError("invite_email_mismatch");
    }

    const existing = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.groupId, inv.groupId), eq(memberships.userId, userId)))
      .get();
    if (existing) throw new AppError("already_member"); // don't consume the invite

    // Atomic consume: the WHERE re-checks usability, so a single-use link can't be used twice.
    const res = await tx
      .update(invitations)
      .set({ useCount: sql`${invitations.useCount} + 1` })
      .where(
        and(
          eq(invitations.id, inv.id),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
          or(eq(invitations.reusable, true), eq(invitations.useCount, 0)),
        ),
      );
    if (res.rowsAffected !== 1) throw new AppError("invite_invalid");

    await tx.insert(memberships).values({ groupId: inv.groupId, userId, role: inv.role });
    await audit(tx, { groupId: inv.groupId, actorId: userId, action: "member.joined", targetUserId: userId, meta: { role: inv.role } });
    return inv.groupId;
  });
}
