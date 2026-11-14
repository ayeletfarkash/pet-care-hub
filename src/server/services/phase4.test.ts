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
import { notifications, pushSubscriptions, taskAssignees, tasks } from "../db/schema";
import { makeGroup, makeUser } from "../../test/factories";
import { resetRateLimits } from "../rate-limit";
import { addMinutesLocal, nowLocal } from "../schedule";
import { eventSchema, inventoryItemSchema, medicationPlanSchema, newOrderSchema, pushSubscriptionSchema, reminderRuleSchema, searchSchema, snoozeSchema, stockChangeSchema, taskSchema } from "../validation";
import { acceptInvitation, createInvitation } from "./invitations";
import { leaveGroup, removeMember } from "./members";
import { createPlan, recordAdministration } from "./medications";
import { createEvent } from "./events";
import { completeTask, createTask, getTask } from "./tasks";
import { createOrder } from "./orders";
import { setOccurrenceStatus } from "./events";
import { changeStock, createItem } from "./inventory";
import { getNotificationPrefs, getReminderRule, listNotifications, markRead, pendingSnoozes, setNotificationPrefs, setReminderRule, snoozeNotification, unreadCount } from "./notifications";
import { deliverPush, saveSubscription } from "./push";
import { searchAll, searchFilterOptions } from "./search";
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
