import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, writeTx, type Tx } from "../db";
import { dismissedAutoTasks, notifications, reminderRuleRecipients, reminderRules, taskAssignees, taskComments, taskHistory, taskTransferRequests, tasks, users } from "../db/schema";
import { audit } from "../audit";
import { AppError, isUniqueViolation } from "../errors";
import { requireMembersOf, requireMembership } from "../permissions";
import { addMinutesLocal, nextOccurrence, nowLocal, type LocalDate } from "../schedule";
import type { TaskInput } from "../validation";

// PRD §10.
// "cancelled" is no longer set (Phase 3 UI improvements); legacy cancelled rows stay readable.

export type TaskRow = typeof tasks.$inferSelect;
const OPEN = ["new", "in_progress"] as const;
export const isOpen = (t: Pick<TaskRow, "status">) => (OPEN as readonly string[]).includes(t.status);
export const isOverdue = (t: Pick<TaskRow, "status" | "dueAt">, now = nowLocal()) => isOpen(t) && !!t.dueAt && t.dueAt < now;

const history = (tx: Tx, groupId: string, taskId: string, actorId: string, action: string, meta?: object) =>
  tx.insert(taskHistory).values({ groupId, taskId, actorId, action, meta: meta ? JSON.stringify(meta) : null });

async function loadTask(tx: Tx, groupId: string, taskId: string) {
  const t = await tx.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.groupId, groupId))).get();
  if (!t) throw new AppError("not_found");
  return t;
}

async function assigneesOf(ex: Tx | typeof db, taskIds: string[]) {
  if (taskIds.length === 0) return new Map<string, { userId: string; name: string }[]>();
  const rows = await ex.select({ taskId: taskAssignees.taskId, userId: users.id, name: users.name })
    .from(taskAssignees).innerJoin(users, eq(users.id, taskAssignees.userId)).where(inArray(taskAssignees.taskId, taskIds));
  const m = new Map<string, { userId: string; name: string }[]>();
  for (const r of rows) m.set(r.taskId, [...(m.get(r.taskId) ?? []), { userId: r.userId, name: r.name }]);
  return m;
}

export async function listTasks(userId: string, groupId: string, view: "open" | "done" = "open") {
  await requireMembership(db, userId, groupId);
  const rows = await db.select().from(tasks).where(and(
    eq(tasks.groupId, groupId),
    view === "open" ? inArray(tasks.status, [...OPEN]) : eq(tasks.status, "completed"),
  )).orderBy(view === "open" ? asc(tasks.dueAt) : desc(tasks.updatedAt)).limit(view === "open" ? 500 : 100);
  const a = await assigneesOf(db, rows.map((t) => t.id));
  const now = nowLocal();
  // Undated open tasks after dated ones.
  const sorted = view === "open" ? [...rows].sort((x, y) => (x.dueAt ?? "9999").localeCompare(y.dueAt ?? "9999")) : rows;
  return { tasks: sorted.map((t) => ({ ...t, assignees: a.get(t.id) ?? [], overdue: isOverdue(t, now) })) };
}

export async function getTask(userId: string, groupId: string, taskId: string) {
  await requireMembership(db, userId, groupId);
  const t = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.groupId, groupId))).get();
  if (!t) throw new AppError("not_found");
  const [a, comments, hist] = await Promise.all([
    assigneesOf(db, [taskId]),
    db.select({ id: taskComments.id, body: taskComments.body, createdAt: taskComments.createdAt, name: users.name })
      .from(taskComments).leftJoin(users, eq(users.id, taskComments.userId))
      .where(and(eq(taskComments.taskId, taskId), eq(taskComments.groupId, groupId))).orderBy(asc(taskComments.createdAt)),
    db.select({ id: taskHistory.id, action: taskHistory.action, meta: taskHistory.meta, createdAt: taskHistory.createdAt, name: users.name })
      .from(taskHistory).leftJoin(users, eq(users.id, taskHistory.actorId))
      .where(and(eq(taskHistory.taskId, taskId), eq(taskHistory.groupId, groupId))).orderBy(desc(taskHistory.createdAt), desc(sql`"task_history"."rowid"`)),
  ]);
  return { task: { ...t, overdue: isOverdue(t) }, assignees: a.get(taskId) ?? [], comments, history: hist };
}

export async function createTask(userId: string, groupId: string, input: TaskInput) {
  return writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await requireMembersOf(tx, groupId, input.assignees);
    const { assignees, reminder, ...fields } = input;
    const [t] = await tx.insert(tasks).values({ ...fields, groupId, seriesId: crypto.randomUUID(), createdById: userId }).returning({ id: tasks.id });
    for (const u of assignees) await tx.insert(taskAssignees).values({ taskId: t.id, userId: u, groupId });
    // Same as the task page's reminder card with its default recipients (any member may set task reminders).
    if (reminder) await tx.insert(reminderRules).values({ groupId, sourceType: "task", sourceId: t.id, ...reminder, recipientMode: "responsible", updatedById: userId, updatedAt: new Date() });
    await history(tx, groupId, t.id, userId, "created");
    return t.id;
  });
}

export async function updateTask(userId: string, groupId: string, taskId: string, input: TaskInput) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await requireMembersOf(tx, groupId, input.assignees);
    const t = await loadTask(tx, groupId, taskId);
    if (!isOpen(t)) throw new AppError("task_closed");
    const { assignees, reminder: _reminder, ...fields } = input;
    try {
      await tx.update(tasks).set({ ...fields, updatedAt: new Date() }).where(eq(tasks.id, taskId));
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError("invalid_input"); // another instance of the series already has that due time
      throw e;
    }
    await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
    for (const u of assignees) await tx.insert(taskAssignees).values({ taskId, userId: u, groupId });
    await history(tx, groupId, taskId, userId, "edited");
  });
}

export async function startTask(userId: string, groupId: string, taskId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    const t = await loadTask(tx, groupId, taskId);
    if (t.status !== "new") throw new AppError("task_closed");
    await tx.update(tasks).set({ status: "in_progress", updatedAt: new Date() }).where(eq(tasks.id, taskId));
    await history(tx, groupId, taskId, userId, "started");
  });
}

/** The next instance keeps the reminder and recipients; a custom time moves by as much as the due date did. */
async function copyReminder(tx: Tx, groupId: string, fromId: string, toId: string, shiftMinutes: number) {
  const rule = await tx.select().from(reminderRules).where(and(eq(reminderRules.sourceType, "task"), eq(reminderRules.sourceId, fromId))).get();
  if (!rule) return;
  const [copy] = await tx.insert(reminderRules).values({
    groupId, sourceType: "task", sourceId: toId, leadMinutes: rule.leadMinutes, remindAt: rule.remindAt && addMinutesLocal(rule.remindAt, shiftMinutes),
    recipientMode: rule.recipientMode, updatedById: rule.updatedById, updatedAt: new Date(),
  }).returning({ id: reminderRules.id });
  const users = await tx.select({ userId: reminderRuleRecipients.userId }).from(reminderRuleRecipients).where(eq(reminderRuleRecipients.ruleId, rule.id));
  if (users.length) await tx.insert(reminderRuleRecipients).values(users.map((u) => ({ ruleId: copy.id, userId: u.userId, groupId })));
}

/** Complete. A recurring task spawns its next instance from the due date, at most once. */
export async function completeTask(userId: string, groupId: string, taskId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    const t = await loadTask(tx, groupId, taskId);
    if (!isOpen(t)) throw new AppError("task_closed");
    await tx.update(tasks).set({ status: "completed", completedAt: new Date(), completedById: userId, updatedAt: new Date() }).where(eq(tasks.id, taskId));
    await history(tx, groupId, taskId, userId, "completed");
    if (t.recurrence !== "none" && t.dueAt) {
      const dueAt = nextOccurrence(t.dueAt, t.recurrence, t.recurrenceInterval);
      const [next] = await tx.insert(tasks).values({
        groupId, seriesId: t.seriesId, title: t.title, description: t.description, priority: t.priority,
        recurrence: t.recurrence, recurrenceInterval: t.recurrenceInterval,
        dueAt, createdById: t.createdById,
      }).onConflictDoNothing({ target: [tasks.seriesId, tasks.dueAt] }).returning({ id: tasks.id });
      if (next) {
        const a = await tx.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, taskId));
        for (const x of a) await tx.insert(taskAssignees).values({ taskId: next.id, userId: x.userId, groupId });
        await copyReminder(tx, groupId, taskId, next.id, (Date.parse(`${dueAt}Z`) - Date.parse(`${t.dueAt}Z`)) / 60_000);
        await history(tx, groupId, next.id, userId, "created", { recurringFrom: taskId });
      }
    }
  });
}

/**
 * Undo a mistaken completion. A recurring task's next instance,
 * already created, stays; reopening doesn't create or delete instances.
 */
export async function reopenTask(userId: string, groupId: string, taskId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    const t = await loadTask(tx, groupId, taskId);
    if (t.status !== "completed") throw new AppError("task_closed");
    await tx.update(tasks).set({ status: "new", completedAt: null, completedById: null, updatedAt: new Date() }).where(eq(tasks.id, taskId));
    await history(tx, groupId, taskId, userId, "reopened");
  });
}

/**
 * Permanent delete. Dependents are removed explicitly in the same transaction: assignees,
 * comments, history, transfer requests, its reminder rule and its notifications (polymorphic, no FK).
 * Other instances of a recurring series stay; deleting the open instance ends the series.
 * A deleted automatic task is remembered so the generator doesn't create it again.
 */
export async function deleteTask(userId: string, groupId: string, taskId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    const t = await loadTask(tx, groupId, taskId);
    const rules = await tx.select({ id: reminderRules.id }).from(reminderRules)
      .where(and(eq(reminderRules.groupId, groupId), eq(reminderRules.sourceType, "task"), eq(reminderRules.sourceId, taskId)));
    if (rules.length) await tx.delete(reminderRuleRecipients).where(inArray(reminderRuleRecipients.ruleId, rules.map((r) => r.id)));
    await tx.delete(reminderRules).where(and(eq(reminderRules.groupId, groupId), eq(reminderRules.sourceType, "task"), eq(reminderRules.sourceId, taskId)));
    await tx.delete(notifications).where(and(eq(notifications.groupId, groupId), eq(notifications.sourceType, "task"), eq(notifications.sourceId, taskId)));
    for (const child of [taskAssignees, taskComments, taskHistory, taskTransferRequests]) await tx.delete(child).where(eq(child.taskId, taskId));
    if (t.sourceKey) await tx.insert(dismissedAutoTasks).values({ groupId, sourceKey: t.sourceKey }).onConflictDoNothing();
    await tx.delete(tasks).where(eq(tasks.id, taskId));
    await audit(tx, { groupId, actorId: userId, action: "task.deleted", meta: { id: t.id, title: t.title, dueAt: t.dueAt, status: t.status } });
  });
}

export async function addComment(userId: string, groupId: string, taskId: string, body: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await loadTask(tx, groupId, taskId);
    await tx.insert(taskComments).values({ groupId, taskId, userId, body });
  });
}

/**
 * Responsibility transfer (PRD §10.4), applied at once. The person handing over stops being an
 * assignee; someone who isn't one just adds a person.
 */
export async function transferTask(userId: string, groupId: string, taskId: string, toUserId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await requireMembersOf(tx, groupId, [toUserId]);
    const t = await loadTask(tx, groupId, taskId);
    if (!isOpen(t)) throw new AppError("task_closed");
    await tx.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)));
    await tx.insert(taskAssignees).values({ taskId, userId: toUserId, groupId }).onConflictDoNothing();
    await history(tx, groupId, taskId, userId, "transfer_approved", { to: toUserId });
  });
}

/** Open tasks in the given groups (dashboard). Caller must already have checked membership. */
export async function openTasksForGroups(groupIds: string[], opts: { assignedTo?: string } = {}) {
  if (groupIds.length === 0) return [];
  let ids: string[] | undefined;
  if (opts.assignedTo) {
    ids = (await db.select({ id: taskAssignees.taskId }).from(taskAssignees)
      .where(and(eq(taskAssignees.userId, opts.assignedTo), inArray(taskAssignees.groupId, groupIds)))).map((r) => r.id);
    if (ids.length === 0) return [];
  }
  const rows = await db.select().from(tasks).where(and(
    inArray(tasks.groupId, groupIds),
    inArray(tasks.status, [...OPEN]),
    ids ? inArray(tasks.id, ids) : undefined,
  )).orderBy(asc(tasks.dueAt)).limit(200);
  const now = nowLocal();
  return rows.map((t) => ({ ...t, overdue: isOverdue(t, now) }));
}

/** Open and completed tasks due in [from, to], for the calendar (completed ones stay visible so they can be reopened). */
export async function groupTasksDue(userId: string, groupId: string, from: LocalDate, to: LocalDate) {
  await requireMembership(db, userId, groupId);
  const rows = await db.select().from(tasks).where(and(
    eq(tasks.groupId, groupId),
    inArray(tasks.status, [...OPEN, "completed"]),
    gte(tasks.dueAt, `${from}T00:00`),
    lte(tasks.dueAt, `${to}T23:59`),
  )).orderBy(asc(tasks.dueAt));
  const now = nowLocal();
  return rows.map((t) => ({ ...t, overdue: isOverdue(t, now) }));
}
