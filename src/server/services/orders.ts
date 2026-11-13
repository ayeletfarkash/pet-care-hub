import { and, desc, eq } from "drizzle-orm";
import { db, writeTx, type Tx } from "../db";
import { inventoryItems, inventoryMovements, orders, type ORDER_STATUSES } from "../db/schema";
import { AppError } from "../errors";
import { requireMembership } from "../permissions";
import { nowLocal } from "../schedule";
import type { OrderInput } from "../validation";
import { applyStockChange } from "./inventory";

// PRD §9. Purchases made outside the app. Both roles create orders and change their status;
// only Admins edit details or delete. Delivering can add the quantity to the linked item, once.

type Status = (typeof ORDER_STATUSES)[number];

export async function listOrders(userId: string, groupId: string) {
  const role = await requireMembership(db, userId, groupId);
  const rows = await db.select({ o: orders, itemName: inventoryItems.name }).from(orders)
    .leftJoin(inventoryItems, eq(inventoryItems.id, orders.itemId))
    .where(eq(orders.groupId, groupId)).orderBy(desc(orders.orderDate), desc(orders.createdAt));
  return { role, orders: rows.map(({ o, itemName }) => ({ ...o, itemName })) };
}

export async function getOrder(userId: string, groupId: string, orderId: string) {
  const role = await requireMembership(db, userId, groupId);
  const row = await db.select({ o: orders, itemName: inventoryItems.name, itemUnit: inventoryItems.unit }).from(orders)
    .leftJoin(inventoryItems, eq(inventoryItems.id, orders.itemId))
    .where(and(eq(orders.id, orderId), eq(orders.groupId, groupId))).get();
  if (!row) throw new AppError("not_found");
  const stocked = await db.select({ id: inventoryMovements.id }).from(inventoryMovements)
    .where(and(eq(inventoryMovements.orderId, orderId), eq(inventoryMovements.groupId, groupId))).get();
  return { role, order: { ...row.o, itemName: row.itemName, itemUnit: row.itemUnit, addedToStock: !!stocked } };
}

/** A linked inventory item must belong to the same group. */
async function checkItem(tx: Tx, groupId: string, itemId: string | null | undefined) {
  if (!itemId) return;
  const i = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.groupId, groupId))).get();
  if (!i) throw new AppError("invalid_reference");
}

export async function createOrder(userId: string, groupId: string, input: OrderInput & { status: Status }) {
  return writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await checkItem(tx, groupId, input.itemId);
    const [o] = await tx.insert(orders).values({ ...input, groupId, createdById: userId, deliveredAt: input.status === "delivered" ? nowLocal() : null })
      .returning({ id: orders.id });
    return o.id;
  });
}

export async function updateOrder(userId: string, groupId: string, orderId: string, input: OrderInput) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    await checkItem(tx, groupId, input.itemId);
    const res = await tx.update(orders).set({ ...input, updatedAt: new Date() }).where(and(eq(orders.id, orderId), eq(orders.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
}

export async function deleteOrder(userId: string, groupId: string, orderId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    const res = await tx.delete(orders).where(and(eq(orders.id, orderId), eq(orders.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
}

/**
 * Both roles. When delivered with `addToStock`, the order's quantity is added to its linked item as
 * a purchase (at most once per order; a repeat is a no-op). Changing status back never removes
 * stock; an Admin corrects it with an adjustment.
 */
export async function setOrderStatus(userId: string, groupId: string, orderId: string, status: Status, addToStock: boolean) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    const o = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.groupId, groupId))).get();
    if (!o) throw new AppError("not_found");
    const deliveredAt = status === "delivered" ? (o.deliveredAt ?? nowLocal()) : null;
    await tx.update(orders).set({ status, deliveredAt, updatedAt: new Date() }).where(eq(orders.id, orderId));
    if (status !== "delivered" || !addToStock || !o.itemId || !o.quantity || o.quantity <= 0) return;
    const done = await tx.select({ id: inventoryMovements.id }).from(inventoryMovements).where(and(eq(inventoryMovements.orderId, orderId), eq(inventoryMovements.groupId, groupId))).get();
    if (!done) await applyStockChange(tx, groupId, o.itemId, userId, { kind: "purchase", amount: o.quantity, note: o.product }, orderId);
  });
}
