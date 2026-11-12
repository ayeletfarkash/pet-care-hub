import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "./db";
import { groups, memberships, type Role } from "./db/schema";
import { AppError } from "./errors";

/**
 * The single gate for every group-scoped read or write. Throws `not_found` when the user is
 * not a member or the group is missing/soft-deleted (indistinguishable on purpose), and
 * `forbidden` when an admin role is required but the member is a caregiver.
 */
export async function requireMembership(
  ex: Executor,
  userId: string,
  groupId: string,
  minRole?: Role,
  opts: { includeDeleted?: boolean } = {},
): Promise<Role> {
  const row = await ex
    .select({ role: memberships.role })
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
  if (minRole === "admin" && row.role !== "admin") throw new AppError("forbidden");
  return row.role;
}

export async function countAdmins(ex: Executor, groupId: string): Promise<number> {
  const rows = await ex
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), eq(memberships.role, "admin")));
  return rows.length;
}
