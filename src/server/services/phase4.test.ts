import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { notifications } from "../db/schema";
import { makeGroup, makeUser } from "../../test/factories";
import { resetRateLimits } from "../rate-limit";
import { addMinutesLocal, nowLocal } from "../schedule";
import { eventSchema, inventoryItemSchema, medicationPlanSchema, reminderRuleSchema, stockChangeSchema, taskSchema } from "../validation";
import { acceptInvitation, createInvitation } from "./invitations";
import { leaveGroup, removeMember } from "./members";
import { createPlan, recordAdministration } from "./medications";
import { createEvent } from "./events";
import { createTask } from "./tasks";
import { changeStock, createItem } from "./inventory";
import { getNotificationPrefs, getReminderRule, listNotifications, markRead, setNotificationPrefs, setReminderRule, unreadCount } from "./notifications";
import { sweep } from "./reminders";

const code = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return (e as { code?: string }).code ?? String(e); }
};
async function setup() {
  const admin = await makeUser("Admin"), care = await makeUser("Care"), out = await makeUser("Out");
  const g = await makeGroup(admin.id), gOut = await makeGroup(out.id, "Other");
  const token = await createInvitation(admin.id, g, { role: "caregiver", reusable: false, email: null, expiresInDays: 7 });
  await acceptInvitation(care.id, token);
  return { admin: admin.id, care: care.id, out: out.id, g, gOut };
}
/** Local time `min` minutes from now, split for the form schemas. */
const at = (min: number) => { const s = nowLocal(new Date(Date.now() + min * 60_000)); return { date: s.slice(0, 10), time: s.slice(11), s }; };
const task = (min: number, o = {}) => { const a = at(min); return taskSchema.parse({ title: "Feed", dueDate: a.date, dueTime: a.time, ...o }); };
const rule = (o: Record<string, unknown>) => reminderRuleSchema.parse({ leadMinutes: "0", recipientMode: "responsible", ...o });
const mine = async (userId: string, sourceId: string) =>
  db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.sourceId, sourceId)));

beforeEach(() => resetRateLimits());

describe("schedule helper", () => {
  it("adds minutes to wall-clock strings across day and month ends", () => {
    expect(addMinutesLocal("2026-03-01T00:10", -15)).toBe("2026-02-28T23:55");
    expect(addMinutesLocal("2026-12-31T23:30", 60)).toBe("2027-01-01T00:30");
  });
});

describe("reminder sweep", () => {
  it("reminds the assignee once, however often it runs", async () => {
    const s = await setup();
    const id = await createTask(s.admin, s.g, task(-5, { assignees: [s.care] }));
    await sweep();
    await sweep();
    expect(await mine(s.care, id)).toHaveLength(1);
    expect(await mine(s.admin, id)).toHaveLength(0);
    expect((await listNotifications(s.care)).find((n) => n.sourceId === id)?.taskOpen).toBe(true);
  });

  it("respects personal preferences without affecting others", async () => {
    const s = await setup();
    await setNotificationPrefs(s.care, ["medications", "events", "inventory", "routines"]); // tasks off
    expect((await getNotificationPrefs(s.care)).tasks).toBe(false);
    expect((await getNotificationPrefs(s.admin)).tasks).toBe(true);
    const id = await createTask(s.admin, s.g, task(-5, { assignees: [s.care, s.admin] }));
    await sweep();
    expect(await mine(s.care, id)).toHaveLength(0);
    expect(await mine(s.admin, id)).toHaveLength(1);
  });

  it("sends to selected members or everyone; unassigned sources go to everyone", async () => {
    const s = await setup();
    const t1 = await createTask(s.admin, s.g, task(-5, { assignees: [s.care] }));
    await setReminderRule(s.care, s.g, "task", t1, rule({ recipientMode: "selected", recipients: [s.admin] }));
    const plan = await createPlan(s.admin, s.g, medicationPlanSchema.parse({ name: "Pill", dosage: "1", scheduleType: "daily", times: [at(-3).time], startDate: at(-3).date }));
    await sweep();
    expect(await mine(s.admin, t1)).toHaveLength(1);
    expect(await mine(s.care, t1)).toHaveLength(0);
    expect(await mine(s.admin, plan)).toHaveLength(1);
    expect(await mine(s.care, plan)).toHaveLength(1);
    expect(await mine(s.out, plan)).toHaveLength(0);
  });

  it("uses the lead time and skips doses already given", async () => {
    const s = await setup();
    const soon = await createEvent(s.admin, s.g, eventSchema.parse({ type: "vet", title: "Vet", date: at(50).date, time: at(50).time, assigneeId: s.care }));
    const later = await createEvent(s.admin, s.g, eventSchema.parse({ type: "vet", title: "Later", date: at(1200).date, time: at(1200).time, assigneeId: s.care }));
    const plan = await createPlan(s.admin, s.g, medicationPlanSchema.parse({ name: "Given", dosage: "1", scheduleType: "daily", times: [at(-3).time], startDate: at(-3).date, responsibleUserId: s.care }));
    await recordAdministration(s.care, s.g, plan, at(-3).s);
    await sweep();
    expect(await mine(s.care, soon)).toHaveLength(1); // default: 1 hour before
    expect(await mine(s.care, later)).toHaveLength(0);
    expect(await mine(s.care, plan)).toHaveLength(0);
    await setReminderRule(s.admin, s.g, "event", later, rule({ leadMinutes: "1440" }));
    await sweep();
    expect(await mine(s.care, later)).toHaveLength(1);
  });

  it("warns everyone about low stock once per restock cycle", async () => {
    const s = await setup();
    const item = await createItem(s.admin, s.g, inventoryItemSchema.parse({ name: "Kibble", type: "food", quantity: "1", lowStockThreshold: "2" }));
    await sweep();
    await sweep();
    expect(await mine(s.admin, item)).toHaveLength(1);
    expect(await mine(s.care, item)).toHaveLength(1);
    await changeStock(s.care, s.g, item, stockChangeSchema.parse({ kind: "purchase", amount: "0.5" })); // still low → new cycle
    await sweep();
    expect(await mine(s.care, item)).toHaveLength(2);
  });

  it("stops reminding members who left, and removes their notifications", async () => {
    const s = await setup();
    const id = await createTask(s.admin, s.g, task(-5, { assignees: [s.care] }));
    await sweep();
    expect(await mine(s.care, id)).toHaveLength(1);
    await removeMember(s.admin, s.g, s.care);
    expect(await mine(s.care, id)).toHaveLength(0);
    const id2 = await createTask(s.admin, s.g, task(-4));
    await sweep();
    expect(await mine(s.care, id2)).toHaveLength(0);
  });
});

describe("reminder rules and inbox permissions", () => {
  it("checks roles, sources and recipients", async () => {
    const s = await setup();
    const plan = await createPlan(s.admin, s.g, medicationPlanSchema.parse({ name: "P", dosage: "1", scheduleType: "daily", times: ["08:00"], startDate: at(0).date }));
    const tId = await createTask(s.admin, s.g, task(60));
    expect(await code(setReminderRule(s.care, s.g, "medication", plan, rule({})))).toBe("forbidden");
    expect(await code(setReminderRule(s.care, s.g, "task", tId, rule({ recipientMode: "all" })))).toBe("ok");
    expect(await code(setReminderRule(s.out, s.g, "task", tId, rule({})))).toBe("not_found");
    expect(await code(setReminderRule(s.out, s.gOut, "task", tId, rule({})))).toBe("not_found"); // id from another group
    expect(await code(setReminderRule(s.admin, s.g, "task", tId, rule({ recipientMode: "selected", recipients: [s.out] })))).toBe("invalid_assignee");
    expect(reminderRuleSchema.safeParse({ leadMinutes: "7", recipientMode: "all" }).success).toBe(false);
    expect(reminderRuleSchema.safeParse({ leadMinutes: "0", recipientMode: "selected" }).success).toBe(false);
    expect((await getReminderRule(s.care, s.g, "medication", plan)).canEdit).toBe(false);
    expect((await getReminderRule(s.care, s.g, "task", tId)).recipientMode).toBe("all");
  });

  it("never shows or changes another user's notifications", async () => {
    const s = await setup();
    const id = await createTask(s.admin, s.g, task(-5, { assignees: [s.care] }));
    await sweep();
    const [n] = await mine(s.care, id);
    expect(await unreadCount(s.care)).toBeGreaterThan(0);
    expect((await listNotifications(s.out)).length).toBe(0);
    await markRead(s.out, n.id);
    expect((await mine(s.care, id))[0].readAt).toBeNull();
    await markRead(s.care, n.id);
    expect((await mine(s.care, id))[0].readAt).not.toBeNull();
    await leaveGroup(s.care, s.g);
    expect(await unreadCount(s.care)).toBe(0);
  });
});
