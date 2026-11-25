import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Executor } from "./db";
import { groups, memberships } from "./db/schema";
import { AppError } from "./errors";

/**
 * The single gate for every group-scoped read or write. Throws `not_found` when the user is
 * not a member or the group is missing/soft-deleted (indistinguishable on purpose).
 * All members of a group have the same rights (PRD §3).
 */
export async function requireMembership(
  ex: Executor,
  userId: string,
  groupId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<void> {
  const row = await ex
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.groupId, groupId),
        opts.includeDeleted ? undefined : isNull(groups.deletedAt),
      ),
    )
    .get();
  if (!row) throw new AppError("not_found");
}

export async function countMembers(ex: Executor, groupId: string): Promise<number> {
  const rows = await ex.select({ id: memberships.id }).from(memberships).where(eq(memberships.groupId, groupId));
  return rows.length;
}

/** Users referenced by a record (assignee, responsible person) must be current members of its group. */
export async function requireMembersOf(ex: Executor, groupId: string, userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  const rows = await ex
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), inArray(memberships.userId, ids)));
  if (rows.length !== ids.length) throw new AppError("invalid_assignee");
}
