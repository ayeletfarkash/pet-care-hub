import { beforeEach, describe, expect, it } from "vitest";
import { makeGroup, makeUser } from "../../test/factories";
import { resetRateLimits } from "../rate-limit";
import { addDays, todayLocal } from "../schedule";
import { inventoryItemSchema, medicationPlanSchema, newOrderSchema, orderSchema, routineSchema, stockChangeSchema } from "../validation";
import { acceptInvitation, createInvitation } from "./invitations";
import { removeMember } from "./members";
import { createPlan } from "./medications";
import { changeStock, createItem, deleteItem, getItem, itemsNeedingReorder, listItems, updateItem } from "./inventory";
import { createOrder, deleteOrder, getOrder, setOrderStatus, updateOrder } from "./orders";
import { createRoutine, deleteRoutine, endRoutine, getRoutine, groupActivities, logActivity, removeLog, routineHistory, updateRoutine } from "./routines";

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
const item = (o = {}) => inventoryItemSchema.parse({ name: "Kibble", type: "food", unit: "kg", quantity: "10", dailyUsage: "0.5", lowStockThreshold: "2", ...o });
const stock = (kind: string, amount = "") => stockChangeSchema.parse({ kind, amount });
const order = (o = {}) => newOrderSchema.parse({ product: "Kibble 10 kg", orderDate: todayLocal(), quantity: "10", ...o });

beforeEach(() => resetRateLimits());

describe("inventory", () => {
  it("members manage products and quantities; outsiders see nothing", async () => {
    const s = await setup();
    expect(await code(createItem(s.out, s.g, item()))).toBe("not_found");
    const id = await createItem(s.care, s.g, item());
    expect(await code(updateItem(s.out, s.gOut, id, item({ name: "X" })))).toBe("not_found");
    expect(await code(deleteItem(s.out, s.gOut, id))).toBe("not_found");
    expect(await code(listItems(s.out, s.g))).toBe("not_found");
    expect(await code(changeStock(s.out, s.gOut, id, stock("consumption", "1")))).toBe("not_found"); // id from another group

    await changeStock(s.care, s.g, id, stock("consumption", "2.5"));
    await changeStock(s.care, s.g, id, stock("purchase", "0.1"));
    await changeStock(s.care, s.g, id, stock("purchase", "0.2"));
    const { item: i, history } = await getItem(s.care, s.g, id);
    expect(i.quantity).toBe(7.8); // rounded, no REAL drift
    expect(i).toMatchObject({ daysLeft: 15, runOutDate: addDays(todayLocal(), 15), needsReorder: false });
    expect(history.map((h) => h.kind)).toEqual(expect.arrayContaining(["purchase", "consumption"]));
    expect(history).toHaveLength(4); // initial stock + 3 changes
  });

  it("never goes below zero; depleted and thresholds trigger reorder; counted quantity is an adjustment", async () => {
    const s = await setup();
    const id = await createItem(s.admin, s.g, item());
    await changeStock(s.care, s.g, id, stock("consumption", "50"));
    const { item: first, history } = await getItem(s.admin, s.g, id);
    expect(first.quantity).toBe(0);
    expect(history[0]).toMatchObject({ kind: "consumption", delta: -10, quantityAfter: 0 });
    expect((await itemsNeedingReorder([s.g])).map((x) => x.id)).toEqual([id]);
    await changeStock(s.care, s.g, id, stock("adjustment", "9"));
    await changeStock(s.care, s.g, id, stock("depleted"));
    expect((await getItem(s.admin, s.g, id)).item).toMatchObject({ quantity: 0, depleted: true });
    expect(stockChangeSchema.safeParse({ kind: "purchase", amount: "" }).success).toBe(false);
  });

  it("a linked medication plan must be in the same group", async () => {
    const s = await setup();
    const planOut = await createPlan(s.out, s.gOut, medicationPlanSchema.parse({ name: "A", dosage: "1", scheduleType: "daily", times: ["08:00"], startDate: todayLocal() }));
    expect(await code(createItem(s.admin, s.g, item({ type: "medication", medicationPlanId: planOut })))).toBe("invalid_reference");
  });
});

describe("orders", () => {
  it("members create, edit and delete; outsiders cannot; urls are http(s) only", async () => {
    const s = await setup();
    const id = await createOrder(s.care, s.g, order());
    await setOrderStatus(s.care, s.g, id, "shipped", false);
    expect((await getOrder(s.admin, s.g, id)).order.status).toBe("shipped");
    expect(await code(updateOrder(s.out, s.gOut, id, orderSchema.parse({ product: "X", orderDate: todayLocal() })))).toBe("not_found");
    expect(await code(deleteOrder(s.out, s.gOut, id))).toBe("not_found");
    expect(await code(getOrder(s.out, s.gOut, id))).toBe("not_found");
    for (const url of ["javascript:alert(1)", "data:text/html,x", "example.com", "https://user:pw@evil.example"]) expect(orderSchema.safeParse({ product: "X", orderDate: todayLocal(), url }).success).toBe(false);
    expect(orderSchema.parse({ product: "X", orderDate: todayLocal(), url: "https://shop.example/p?id=1" }).url).toBe("https://shop.example/p?id=1");
    await deleteOrder(s.care, s.g, id);
  });

  it("delivering adds the quantity to the linked item exactly once", async () => {
    const s = await setup();
    const itemId = await createItem(s.admin, s.g, item({ quantity: "1" }));
    const id = await createOrder(s.care, s.g, order({ itemId }));
    await setOrderStatus(s.care, s.g, id, "delivered", true);
    await setOrderStatus(s.care, s.g, id, "shipped", true);
    await setOrderStatus(s.admin, s.g, id, "delivered", true); // repeat: no second add
    expect((await getItem(s.care, s.g, itemId)).item.quantity).toBe(11);
    expect((await getOrder(s.care, s.g, id)).order).toMatchObject({ status: "delivered", addedToStock: true });
  });

  it("rejects an inventory item from another group", async () => {
    const s = await setup();
    const itemOut = await createItem(s.out, s.gOut, item());
    expect(await code(createOrder(s.care, s.g, order({ itemId: itemOut })))).toBe("invalid_reference");
  });
});

describe("routines", () => {
  const routine = (o = {}) => routineSchema.parse({ name: "Walk", scheduleType: "daily", times: ["00:00"], startDate: addDays(todayLocal(), -3), ...o });

  it("members define routines and log completed and missed activities; outsiders cannot", async () => {
    const s = await setup();
    expect(await code(createRoutine(s.out, s.g, routine()))).toBe("not_found");
    const id = await createRoutine(s.care, s.g, routine({ responsibleUserId: s.care }));
    expect(await code(updateRoutine(s.out, s.gOut, id, routine()))).toBe("not_found");
    const today = `${todayLocal()}T00:00`, yesterday = `${addDays(todayLocal(), -1)}T00:00`;
    await logActivity(s.care, s.g, { routineId: id, scheduledFor: today, status: "completed" });
    await logActivity(s.care, s.g, { routineId: id, scheduledFor: yesterday, status: "missed" });
    const acts = await groupActivities(s.admin, s.g, addDays(todayLocal(), -2), todayLocal());
    expect(acts.map((a) => a.status)).toEqual(["not_logged", "missed", "completed"]);
    // missed → completed updates the same record
    await logActivity(s.care, s.g, { routineId: id, scheduledFor: yesterday, status: "completed" });
    expect((await routineHistory(s.care, s.g, id)).map((h) => h.status)).toEqual(["completed", "completed"]);
    expect(await code(logActivity(s.out, s.gOut, { routineId: id, scheduledFor: today, status: "completed" }))).toBe("not_found");
  });

  it("validates occurrences: invented and future ones refused; extras are completed only", async () => {
    const s = await setup();
    const id = await createRoutine(s.admin, s.g, routine({ startDate: addDays(todayLocal(), -10) }));
    const bad = (scheduledFor: string | null, status: "completed" | "missed" = "completed") => code(logActivity(s.care, s.g, { routineId: id, scheduledFor, status }));
    expect(await bad(`${todayLocal()}T13:37`)).toBe("invalid_occurrence_log");
    expect(await bad(`${addDays(todayLocal(), 2)}T00:00`)).toBe("invalid_occurrence_log");
    expect(await bad(`${addDays(todayLocal(), -5)}T00:00`, "missed")).toBe("ok"); // no limit on how far back
    expect(await bad(null, "missed")).toBe("invalid_occurrence_log");
    expect(await bad(null)).toBe("ok");
    expect(await bad(null)).toBe("ok"); // several extras allowed
    expect(await routineHistory(s.admin, s.g, id)).toHaveLength(3);
  });

  it("routines with history are ended, not deleted; any member can remove a log; removing a member releases responsibility", async () => {
    const s = await setup();
    const id = await createRoutine(s.admin, s.g, routine({ responsibleUserId: s.care }));
    await logActivity(s.care, s.g, { routineId: id, scheduledFor: null, status: "completed" });
    expect(await code(deleteRoutine(s.admin, s.g, id))).toBe("routine_has_history");
    await endRoutine(s.admin, s.g, id);
    expect((await getRoutine(s.care, s.g, id)).routine.endDate).toBe(todayLocal());
    const [log] = await routineHistory(s.admin, s.g, id);
    expect(await code(removeLog(s.out, s.gOut, log.id))).toBe("not_found");
    await removeLog(s.care, s.g, log.id);
    await removeMember(s.admin, s.g, s.care);
    expect((await getRoutine(s.admin, s.g, id)).routine.responsibleUserId).toBeNull();
    await deleteRoutine(s.admin, s.g, id);
  });

  it("the responsible person must be a member", async () => {
    const s = await setup();
    expect(await code(createRoutine(s.admin, s.g, routine({ responsibleUserId: s.out })))).toBe("invalid_assignee");
  });
});
