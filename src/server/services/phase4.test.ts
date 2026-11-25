import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as { endpoint: string; payload: string }[]);
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      if (sub.endpoint.includes("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, payload });
    },
  },
}));
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { notifications, pushSubscriptions, reminderRules, taskAssignees, taskComments, taskHistory, tasks } from "../db/schema";
import { makeGroup, makeUser } from "../../test/factories";
import { resetRateLimits } from "../rate-limit";
import { addMinutesLocal, nowLocal } from "../schedule";
import { routineSchema } from "../validation";
import { createRoutine } from "./routines";
import { eventSchema, inventoryItemSchema, medicationPlanSchema, newOrderSchema, pushSubscriptionSchema, reminderRuleSchema, searchSchema, snoozeSchema, stockChangeSchema, taskSchema } from "../validation";
import { acceptInvitation, createInvitation } from "./invitations";
import { leaveGroup, removeMember } from "./members";
import { createPlan, recordAdministration } from "./medications";
import { createEvent } from "./events";
import { addComment, completeTask, createTask, deleteTask, getTask } from "./tasks";
import { createOrder } from "./orders";
import { setOccurrenceStatus } from "./events";
import { changeStock, createItem } from "./inventory";
import { getNotificationPrefs, getReminderRule, listNotifications, markRead, pendingSnoozes, setNotificationPrefs, setReminderRule, snoozeNotification, unreadCount } from "./notifications";
import { deliverPush, saveSubscription } from "./push";
import { searchAll, searchFilterOptions } from "./search";
import { insightsFor, isStrugglingSeries } from "./insights";
import { sweep } from "./reminders";

const code = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return (e as { code?: string }).code ?? String(e); }
};
async function setup() {
  const admin = await makeUser("Admin"), care = await makeUser("Care"), out = await makeUser("Out");
  const g = await makeGroup(admin.id), gOut = await makeGroup(out.id, "Other");
  const token = await createInvitation(admin.id, g, { reusable: false, email: null, expiresInDays: 7 });
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
  it("checks membership, sources and recipients", async () => {
    const s = await setup();
    const plan = await createPlan(s.admin, s.g, medicationPlanSchema.parse({ name: "P", dosage: "1", scheduleType: "daily", times: ["08:00"], startDate: at(0).date }));
    const tId = await createTask(s.admin, s.g, task(60));
    expect(await code(setReminderRule(s.care, s.g, "medication", plan, rule({})))).toBe("ok"); // any member
    expect(await code(setReminderRule(s.care, s.g, "task", tId, rule({ recipientMode: "all" })))).toBe("ok");
    expect(await code(setReminderRule(s.out, s.g, "task", tId, rule({})))).toBe("not_found");
    expect(await code(setReminderRule(s.out, s.gOut, "task", tId, rule({})))).toBe("not_found"); // id from another group
    expect(await code(setReminderRule(s.admin, s.g, "task", tId, rule({ recipientMode: "selected", recipients: [s.out] })))).toBe("invalid_assignee");
    expect(reminderRuleSchema.safeParse({ leadMinutes: "7", recipientMode: "all" }).success).toBe(false);
    expect(reminderRuleSchema.safeParse({ leadMinutes: "0", recipientMode: "selected" }).success).toBe(false);
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

describe("snooze", () => {
  it("re-delivers later without touching the task or another user's notifications", async () => {
    const s = await setup();
    const id = await createTask(s.admin, s.g, task(-5, { assignees: [s.care] }));
    await sweep();
    const [n] = await mine(s.care, id);
    const until = at(30).s;
    expect(await code(snoozeNotification(s.out, n.id, until))).toBe("not_found");
    expect(await code(snoozeNotification(s.care, n.id, at(-1).s))).toBe("invalid_snooze");
    expect(await code(snoozeNotification(s.care, n.id, at(31 * 1440).s))).toBe("invalid_snooze");
    await snoozeNotification(s.care, n.id, until);
    const rows = await mine(s.care, id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === n.id)?.readAt).not.toBeNull();
    expect((await listNotifications(s.care)).some((r) => r.kind === "snooze")).toBe(false); // hidden until then
    expect((await pendingSnoozes(s.care)).map((r) => r.deliverAt)).toEqual([until]);
    const { task: t } = await getTask(s.admin, s.g, id);
    expect(t.status).toBe("new"); // the task itself is unchanged
    await sweep();
    expect(await mine(s.care, id)).toHaveLength(2); // the sweep doesn't recreate the original
    await snoozeNotification(s.care, n.id, at(45).s); // snoozing again replaces the pending snooze
    await snoozeNotification(s.care, n.id, at(50).s);
    expect((await pendingSnoozes(s.care)).filter((r) => r.params.name === "Feed").map((r) => r.deliverAt)).toEqual([at(50).s]);
  });

  it("resolves the options to a local time", () => {
    expect(snoozeSchema.parse({ option: "tomorrow" }).until.endsWith("T08:00")).toBe(true);
    expect(snoozeSchema.parse({ option: "custom", customAt: "2030-01-02T09:30" }).until).toBe("2030-01-02T09:30");
    expect(snoozeSchema.safeParse({ option: "custom", customAt: "soon" }).success).toBe(false);
  });
});

describe("web push", () => {
  afterEach(() => { delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; sent.length = 0; });
  const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "BPub_Key-1", auth: "auth_1" } });

  it("accepts only real push service endpoints", () => {
    for (const ok of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/Q", "https://wns2-db5p.notify.windows.com/w/?token=1"])
      expect(pushSubscriptionSchema.safeParse(sub(ok)).success).toBe(true);
    for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://fcm.googleapis.com:8443/x", "https://127.0.0.1/x"])
      expect(pushSubscriptionSchema.safeParse(sub(bad)).success).toBe(false);
  });

  it("pushes each new notification once, without item names, and drops dead subscriptions", async () => {
    const s = await setup();
    await saveSubscription(s.care, pushSubscriptionSchema.parse(sub("https://fcm.googleapis.com/fcm/send/care-1")));
    await saveSubscription(s.care, pushSubscriptionSchema.parse(sub("https://fcm.googleapis.com/fcm/send/gone-1")));
    const id = await createTask(s.admin, s.g, task(-5, { title: "Secret pill", assignees: [s.care] }));
    await sweep();
    expect(await deliverPush()).toBe(0); // no VAPID keys → push off
    process.env.VAPID_PUBLIC_KEY = "pub"; process.env.VAPID_PRIVATE_KEY = "priv";
    await deliverPush();
    const mineSent = sent.filter((x) => x.endpoint.endsWith("care-1"));
    expect(mineSent.length).toBeGreaterThanOrEqual(1);
    expect(mineSent.map((x) => x.payload).join()).not.toContain("Secret pill");
    expect((await mine(s.care, id))[0].pushedAt).not.toBeNull();
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, s.care));
    expect(subs.map((x) => x.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/care-1"]);
    const before = sent.length;
    await deliverPush();
    expect(sent.length).toBe(before); // already pushed
  });
});

describe("custom reminder time and task deletion (tasks UI update)", () => {
  it("custom time: set on create, fires at that time once; must be in the future; tasks only", async () => {
    const s = await setup();
    expect(taskSchema.safeParse({ title: "x", reminder: "custom", remindAt: at(-5).s }).success).toBe(false); // past
    expect(taskSchema.safeParse({ title: "x", reminder: "custom", remindAt: "" }).success).toBe(false);
    expect(taskSchema.safeParse({ title: "x", reminder: "custom", remindAt: "9999-01-01T09:00" }).success).toBe(false); // > 1 year
    const id = await createTask(s.admin, s.g, task(3 * 1440, { assignees: [s.care], reminder: "custom", remindAt: at(10).s }));
    expect(await getReminderRule(s.care, s.g, "task", id)).toMatchObject({ remindAt: at(10).s, recipientMode: "responsible" });
    await sweep();
    expect(await mine(s.care, id)).toHaveLength(0); // not yet
    const later = new Date(Date.now() + 15 * 60_000);
    await sweep(later);
    await sweep(later);
    const [n] = await mine(s.care, id);
    expect(n).toMatchObject({ deliverAt: at(10).s, occurrenceKey: `custom:${at(10).s}` });
    expect(await mine(s.care, id)).toHaveLength(1);
    const ev = await createEvent(s.admin, s.g, eventSchema.parse({ type: "vet", title: "Vet", date: at(600).date, time: at(600).time }));
    expect(await code(setReminderRule(s.admin, s.g, "event", ev, rule({ leadMinutes: "custom", remindAt: at(30).s })))).toBe("invalid_input");
    // An undated task can have a custom reminder too; preferences still apply.
    await setNotificationPrefs(s.admin, ["medications", "events", "inventory", "routines"]);
    const undated = await createTask(s.care, s.g, taskSchema.parse({ title: "Call groomer", reminder: "custom", remindAt: at(10).s }));
    await sweep(later);
    expect(await mine(s.care, undated)).toHaveLength(1);
    expect(await mine(s.admin, undated)).toHaveLength(0);
  });

  it("a fired custom time may stay while recipients change, but a new past time is refused", async () => {
    const s = await setup();
    const id = await createTask(s.admin, s.g, task(1440, { reminder: "custom", remindAt: at(10).s }));
    await db.update(reminderRules).set({ remindAt: at(-30).s }).where(eq(reminderRules.sourceId, id)); // time passes
    const past = (min: number) => ({ leadMinutes: "custom", remindAt: at(min).s, recipientMode: "all" });
    expect(reminderRuleSchema.safeParse(past(-30)).success).toBe(true); // the service compares with the saved time
    expect(await code(setReminderRule(s.admin, s.g, "task", id, rule(past(-30))))).toBe("ok");
    expect((await getReminderRule(s.admin, s.g, "task", id)).recipientMode).toBe("all");
    expect(await code(setReminderRule(s.admin, s.g, "task", id, rule(past(-20))))).toBe("past_reminder");
  });

  it("a repeating task's next instance keeps the reminder and its recipients; a custom time moves with the due date", async () => {
    const s = await setup();
    const daily = { recurrence: "daily", recurrenceInterval: "2" };
    const nextOf = async (id: string) => {
      const [{ seriesId }] = await db.select().from(tasks).where(eq(tasks.id, id));
      await completeTask(s.care, s.g, id);
      return (await db.select().from(tasks).where(eq(tasks.seriesId, seriesId))).find((x) => x.id !== id)!.id;
    };
    const preset = await createTask(s.admin, s.g, task(60, daily));
    await setReminderRule(s.admin, s.g, "task", preset, rule({ leadMinutes: "15", recipientMode: "selected", recipients: [s.care] }));
    expect(await getReminderRule(s.admin, s.g, "task", await nextOf(preset))).toMatchObject({ leadMinutes: 15, remindAt: null, recipientMode: "selected", recipients: [s.care] });
    const custom = await createTask(s.admin, s.g, task(60, { ...daily, reminder: "custom", remindAt: at(20).s }));
    const { remindAt } = await getReminderRule(s.admin, s.g, "task", custom);
    expect((await getReminderRule(s.admin, s.g, "task", await nextOf(custom))).remindAt).toBe(addMinutesLocal(remindAt!, 2 * 1440));
  });

  it("members delete permanently; dependents go with it; others' groups untouched", async () => {
    const s = await setup();
    const id = await createTask(s.care, s.g, task(-5, { assignees: [s.care], reminder: "15" }));
    await addComment(s.care, s.g, id, "hi");
    await sweep();
    expect(await mine(s.care, id)).toHaveLength(1);
    expect(await code(deleteTask(s.out, s.gOut, id))).toBe("not_found");
    await deleteTask(s.admin, s.g, id);
    expect(await code(getTask(s.admin, s.g, id))).toBe("not_found");
    expect(await mine(s.care, id)).toHaveLength(0);
    expect(await db.select().from(reminderRules).where(eq(reminderRules.sourceId, id))).toHaveLength(0);
    for (const child of [taskAssignees, taskComments, taskHistory]) expect(await db.select().from(child).where(eq(child.taskId, id))).toHaveLength(0);
  });

  it("a deleted automatic task is not created again", async () => {
    const s = await setup();
    const item = await createItem(s.admin, s.g, inventoryItemSchema.parse({ name: "Treats", type: "food", quantity: "0" }));
    await sweep();
    const [auto] = await db.select().from(tasks).where(eq(tasks.sourceId, item));
    await deleteTask(s.admin, s.g, auto.id);
    await sweep();
    expect(await db.select().from(tasks).where(eq(tasks.sourceId, item))).toHaveLength(0);
  });
});

describe("automatic tasks", () => {
  const autoTasks = (groupId: string, sourceId: string) =>
    db.select().from(tasks).where(and(eq(tasks.groupId, groupId), eq(tasks.sourceId, sourceId)));

  it("low stock creates one unassigned reorder task per restock cycle, in the admin's language", async () => {
    const s = await setup();
    const item = await createItem(s.admin, s.g, inventoryItemSchema.parse({ name: "Kibble", type: "food", quantity: "1", lowStockThreshold: "2" }));
    await sweep();
    await sweep();
    let rows = await autoTasks(s.g, item);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("להזמין שוב: Kibble"); // test users are Hebrew
    expect(rows[0].createdById).toBeNull();
    expect(await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, rows[0].id))).toHaveLength(0);
    await completeTask(s.care, s.g, rows[0].id);
    await sweep();
    expect(await autoTasks(s.g, item)).toHaveLength(1); // done stays done in the same cycle
    await changeStock(s.care, s.g, item, stockChangeSchema.parse({ kind: "purchase", amount: "0.5" })); // still low → new cycle
    await sweep();
    rows = await autoTasks(s.g, item);
    expect(rows).toHaveLength(2);
    expect(await autoTasks(s.gOut, item)).toHaveLength(0);
  });

  it("skips items that already have an open order", async () => {
    const s = await setup();
    const item = await createItem(s.admin, s.g, inventoryItemSchema.parse({ name: "Litter", type: "supplies", quantity: "0" }));
    await createOrder(s.care, s.g, newOrderSchema.parse({ product: "Litter", itemId: item, orderDate: at(0).date }));
    await sweep();
    expect(await autoTasks(s.g, item)).toHaveLength(0);
  });

  it("creates opt-in prep and follow-up tasks for appointments, once, assigned like the event", async () => {
    const s = await setup();
    const ev = (min: number, o = {}) => eventSchema.parse({ type: "vet", title: "Vaccine", date: at(min).date, time: at(min).time, assigneeId: s.care, ...o });
    const soon = await createEvent(s.admin, s.g, ev(600, { autoPrep: "on", autoFollowup: "on" }));
    const past = await createEvent(s.admin, s.g, ev(-120, { autoFollowup: "on" }));
    const plain = await createEvent(s.admin, s.g, ev(600));
    const cancelled = await createEvent(s.admin, s.g, ev(-60, { autoFollowup: "on" }));
    await setOccurrenceStatus(s.admin, s.g, cancelled, at(-60).s, "cancelled");
    await sweep();
    await sweep();
    const prep = await autoTasks(s.g, soon);
    expect(prep.map((x) => x.sourceKey)).toEqual([`event:${soon}:${at(600).s}:prep`]); // follow-up only after it happened
    expect(prep[0].dueAt).toBe(at(600).s);
    expect((await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, prep[0].id))).map((a) => a.userId)).toEqual([s.care]);
    const follow = await autoTasks(s.g, past);
    expect(follow).toHaveLength(1);
    expect(follow[0].title).toBe("מעקב אחרי: Vaccine");
    expect(await autoTasks(s.g, plain)).toHaveLength(0);
    expect(await autoTasks(s.g, cancelled)).toHaveLength(0);
  });
});

describe("global search", () => {
  const find = async (userId: string, params: Record<string, string>) => (await searchAll(userId, searchSchema.parse(params))).results;

  it("finds across types in the user's groups and never in other groups", async () => {
    const s = await setup();
    const tag = `zq${crypto.randomUUID().slice(0, 6)}`; // unique per test run (shared test DB)
    await createTask(s.admin, s.g, task(60, { title: `Buy ${tag} food`, assignees: [s.care] }));
    await createItem(s.admin, s.g, inventoryItemSchema.parse({ name: `${tag} kibble`, type: "food", quantity: "5" }));
    await createTask(s.out, s.gOut, task(60, { title: `Secret ${tag}` }));
    const care = await find(s.care, { q: tag });
    expect(care.map((r) => r.type).sort()).toEqual(["products", "tasks"]);
    expect(care.every((r) => r.groupId === s.g)).toBe(true);
    expect((await find(s.out, { q: tag })).map((r) => r.title)).toEqual([`Secret ${tag}`]);
    expect(await find(s.out, { q: tag, group: s.g })).toEqual([]); // a foreign group filter can't widen the scope
    expect((await searchFilterOptions(s.out)).groups.map((g) => g.id)).toEqual([s.gOut]);
    await removeMember(s.admin, s.g, s.care);
    expect(await find(s.care, { q: tag })).toEqual([]); // access ends with membership
  });

  it("applies filters and treats % and _ literally", async () => {
    const s = await setup();
    const tag = `zf${crypto.randomUUID().slice(0, 6)}`;
    const mine = await createTask(s.admin, s.g, task(60, { title: `${tag} walk`, assignees: [s.care] }));
    const done = await createTask(s.admin, s.g, task(60, { title: `${tag} bath` }));
    await completeTask(s.admin, s.g, done);
    expect((await find(s.admin, { q: tag, assignee: s.care })).map((r) => r.id)).toEqual([mine]);
    expect((await find(s.admin, { q: tag, status: "closed" })).map((r) => r.id)).toEqual([done]);
    expect((await find(s.admin, { q: tag, type: "products" }))).toEqual([]);
    expect((await find(s.admin, { q: tag, from: "2000-01-01", to: "2000-01-02" }))).toEqual([]);
    expect((await find(s.admin, { q: "%" }))).toEqual([]); // no "match everything"
    expect((await find(s.admin, { q: "a" }))).toEqual([]); // too short
    await createTask(s.admin, s.g, task(60, { title: `${tag} 100%_done` }));
    expect((await find(s.admin, { q: "0%_d" })).map((r) => r.title)).toContain(`${tag} 100%_done`);
    expect(searchSchema.parse({ q: "x".repeat(500), type: "bogus", from: "nope" })).toMatchObject({ type: undefined, from: undefined });
  });
});

describe("insights", () => {
  it("flags a repeating task when 3 of its last 5 instances slipped", () => {
    const now = "2026-06-30T12:00";
    const at = (d: number, status: string, lateMin: number | null = null) => ({
      status, dueAt: `2026-06-${String(30 - d).padStart(2, "0")}T09:00`,
      completedAt: lateMin == null ? null : new Date(Date.parse(`2026-06-${String(30 - d).padStart(2, "0")}T09:00:00+03:00`) + lateMin * 60_000),
    });
    expect(isStrugglingSeries([at(1, "completed", -10), at(2, "completed", -5), at(3, "completed", 0), at(4, "cancelled"), at(5, "completed", -1)], now)).toBe(false);
    expect(isStrugglingSeries([at(1, "new"), at(2, "completed", 120), at(3, "cancelled"), at(4, "completed", -5)], now)).toBe(true);
    expect(isStrugglingSeries([at(1, "completed", -1), at(2, "completed", -1), at(3, "completed", -1), at(4, "completed", -1), at(5, "completed", -1), at(6, "cancelled"), at(7, "cancelled"), at(8, "cancelled")], now)).toBe(false); // only the last 5 count
    expect(isStrugglingSeries([at(29, "cancelled"), at(29, "cancelled"), at(29, "cancelled")], now)).toBe(false); // older than 4 weeks
  });

  it("summarises rules per group, only for the user's groups, and filters by category", async () => {
    const s = await setup();
    await createTask(s.admin, s.g, task(-90, { title: "Late one" }));
    await createItem(s.admin, s.g, inventoryItemSchema.parse({ name: "Food", type: "food", quantity: "0" }));
    await createItem(s.admin, s.g, inventoryItemSchema.parse({ name: "Treats", type: "treats", quantity: "3", dailyUsage: "1" }));
    await createRoutine(s.admin, s.g, routineSchema.parse({ name: "Walk", scheduleType: "daily", times: [at(-120).time], startDate: at(-24 * 60 * 2).date }));
    await createTask(s.out, s.gOut, task(-90, { title: "Theirs" }));
    const all = await insightsFor(s.care);
    const kinds = (groupId: string) => all.filter((i) => i.groupId === groupId).map((i) => i.kind);
    expect(kinds(s.g)).toEqual(expect.arrayContaining(["overdue_tasks", "low_stock", "running_out", "missed_activities"]));
    expect(all.find((i) => i.kind === "low_stock")?.items.map((x) => x.title)).toEqual(["Food"]);
    expect(all.find((i) => i.kind === "running_out")?.items.map((x) => x.title)).toEqual(["Treats"]);
    expect(all.every((i) => i.groupId === s.g)).toBe(true);
    expect(await insightsFor(s.care, { group: s.gOut })).toEqual([]); // foreign group can't widen scope
    expect((await insightsFor(s.care, { category: "inventory" })).every((i) => i.category === "inventory")).toBe(true);
    expect((await insightsFor(s.out)).flatMap((i) => i.items.map((x) => x.title))).not.toContain("Late one");
  });
});
