import type { Executor } from "./db";
import { auditLogs } from "./db/schema";

export type AuditAction =
  | "group.created" | "group.deleted" | "group.restored" | "pet.updated"
  | "member.joined" | "member.removed" | "member.left" | "member.role_changed"
  | "invitation.created" | "invitation.revoked";

/** Never put tokens or secrets in `meta`. */
export function audit(
  ex: Executor,
  e: { groupId: string; actorId: string; action: AuditAction; targetUserId?: string; meta?: object },
) {
  return ex.insert(auditLogs).values({
    groupId: e.groupId,
    actorId: e.actorId,
    action: e.action,
    targetUserId: e.targetUserId,
    meta: e.meta ? JSON.stringify(e.meta) : null,
  });
}
