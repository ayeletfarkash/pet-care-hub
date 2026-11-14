import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, writeTx, type Tx } from "../db";
import { inventoryItems, inventoryMovements, medicationPlans, users } from "../db/schema";
import { AppError } from "../errors";
import { requireMembership } from "../permissions";
import { stockStatus, todayLocal } from "../schedule";
import { MAX_QTY, roundQty, type InventoryItemInput, type StockChangeInput } from "../validation";

// PRD §8, §6.5. Both roles view and change quantities; only Admins add, edit or delete products.
// Every quantity change writes a movement row, so purchase and consumption history is complete.

export type Item = typeof inventoryItems.$inferSelect;
const withStatus = (i: Item, today = todayLocal()) => ({ ...i, ...stockStatus(i, today) });

export async function listItems(userId: string, groupId: string) {
  const role = await requireMembership(db, userId, groupId);
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.groupId, groupId)).orderBy(asc(inventoryItems.name));
  const today = todayLocal();
  return { role, items: items.map((i) => withStatus(i, today)) };
}

export async function getItem(userId: string, groupId: string, itemId: string) {
  const role = await requireMembership(db, userId, groupId);
  const row = await db.select({ i: inventoryItems, planName: medicationPlans.name }).from(inventoryItems)
    .leftJoin(medicationPlans, eq(medicationPlans.id, inventoryItems.medicationPlanId))
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.groupId, groupId))).get();
  if (!row) throw new AppError("not_found");
  const history = await db
    .select({ m: inventoryMovements, byName: users.name })
    .from(inventoryMovements)
    .leftJoin(users, eq(users.id, inventoryMovements.byUserId))
    .where(and(eq(inventoryMovements.itemId, itemId), eq(inventoryMovements.groupId, groupId)))
    .orderBy(desc(inventoryMovements.createdAt), desc(sql`${inventoryMovements}.rowid`))
    .limit(100);
  return { role, item: { ...withStatus(row.i), planName: row.planName }, history: history.map(({ m, byName }) => ({ ...m, byName })) };
}

/** A linked medication plan must belong to the same group. */
async function checkPlan(tx: Tx, groupId: string, planId: string | null | undefined) {
  if (!planId) return;
  const p = await tx.select({ id: medicationPlans.id }).from(medicationPlans).where(and(eq(medicationPlans.id, planId), eq(medicationPlans.groupId, groupId))).get();
  if (!p) throw new AppError("invalid_reference");
}

export async function createItem(userId: string, groupId: string, input: InventoryItemInput) {
  return writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    await checkPlan(tx, groupId, input.medicationPlanId);
    const [i] = await tx.insert(inventoryItems).values({ ...input, groupId, createdById: userId }).returning({ id: inventoryItems.id });
    if (input.quantity > 0) await tx.insert(inventoryMovements).values({ groupId, itemId: i.id, kind: "purchase", delta: input.quantity, quantityAfter: input.quantity, byUserId: userId });
    return i.id;
  });
}

/** Edits product details. A changed quantity is recorded as an adjustment. */
export async function updateItem(userId: string, groupId: string, itemId: string, input: InventoryItemInput) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    await checkPlan(tx, groupId, input.medicationPlanId);
    const old = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.groupId, groupId))).get();
    if (!old) throw new AppError("not_found");
    await tx.update(inventoryItems).set({ ...input, updatedAt: new Date() }).where(eq(inventoryItems.id, itemId));
    if (input.quantity !== old.quantity)
      await tx.insert(inventoryMovements).values({ groupId, itemId, kind: "adjustment", delta: roundQty(input.quantity - old.quantity), quantityAfter: input.quantity, byUserId: userId });
  });
}

/** PRD §8.3 allows deleting products; the history goes with it (the UI confirms first). */
export async function deleteItem(userId: string, groupId: string, itemId: string) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId, "admin");
    const res = await tx.delete(inventoryItems).where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.groupId, groupId)));
    if (res.rowsAffected === 0) throw new AppError("not_found");
  });
}

/**
 * Apply one stock change inside a write transaction (writeTx serializes writes, so read-then-write
 * is safe). Quantities never go below 0; the movement stores the real delta after clamping.
 */
export async function applyStockChange(tx: Tx, groupId: string, itemId: string, userId: string, change: StockChangeInput, orderId?: string) {
  const item = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.groupId, groupId))).get();
  if (!item) throw new AppError("not_found");
  const amount = change.amount ?? 0;
  const after = roundQty(Math.min(MAX_QTY, Math.max(0,
    change.kind === "purchase" ? item.quantity + amount
      : change.kind === "consumption" ? item.quantity - amount
        : change.kind === "adjustment" ? amount
          : 0)));
  await tx.update(inventoryItems).set({ quantity: after, updatedAt: new Date(), ...(change.kind === "purchase" ? { purchaseDate: todayLocal() } : {}) })
    .where(eq(inventoryItems.id, itemId));
  await tx.insert(inventoryMovements).values({
    groupId, itemId, kind: change.kind, delta: roundQty(after - item.quantity), quantityAfter: after, byUserId: userId, note: change.note ?? null, orderId: orderId ?? null,
  });
}

/** Both roles: record consumption or a purchase, set a counted quantity, or mark as depleted. */
export async function changeStock(userId: string, groupId: string, itemId: string, change: StockChangeInput) {
  await writeTx(async (tx) => {
    await requireMembership(tx, userId, groupId);
    await applyStockChange(tx, groupId, itemId, userId, change);
  });
}

/** Items to reorder across the user's groups (dashboard). Caller must already have checked membership. */
export async function itemsNeedingReorder(groupIds: string[]) {
  if (groupIds.length === 0) return [];
  const today = todayLocal();
  const items = await db.select().from(inventoryItems).where(inArray(inventoryItems.groupId, groupIds)).orderBy(asc(inventoryItems.name));
  return items.map((i) => withStatus(i, today)).filter((i) => i.needsReorder);
}

/** Restock cycle per item = number of purchases so far; a new purchase starts a new cycle (low-stock reminders and reorder tasks repeat once per cycle). */
export async function restockCycles(itemIds: string[]): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db.select({ itemId: inventoryMovements.itemId, n: count() }).from(inventoryMovements)
    .where(and(inArray(inventoryMovements.itemId, itemIds), eq(inventoryMovements.kind, "purchase"))).groupBy(inventoryMovements.itemId);
  return new Map(rows.map((r) => [r.itemId, r.n]));
}
