"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { changeStock, createItem, deleteItem, updateItem } from "@/server/services/inventory";
import { inventoryItemSchema, stockChangeSchema } from "@/server/validation";
import { getT } from "@/i18n/server";
import { handleAction, handleForm, type FormState } from "./form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createItemAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleForm(fd, inventoryItemSchema, async (input) => {
    const id = await createItem(user.id, groupId, input);
    redirect(`/groups/${groupId}/inventory/${id}?notice=saved`);
  });
}

export async function updateItemAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), itemId = str(fd, "itemId");
  return handleForm(fd, inventoryItemSchema, async (input) => {
    await updateItem(user.id, groupId, itemId, input);
    redirect(`/groups/${groupId}/inventory/${itemId}?notice=saved`);
  });
}

export async function deleteItemAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await deleteItem(user.id, groupId, str(fd, "itemId"));
    redirect(`/groups/${groupId}/inventory?notice=deleted`);
  });
}

/** Both roles: consumption, purchase, counted quantity, depleted. */
export async function changeStockAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), itemId = str(fd, "itemId");
  return handleForm(fd, stockChangeSchema, async (input) => {
    await changeStock(user.id, groupId, itemId, input);
    revalidatePath("/", "layout");
    const { t } = await getT();
    return { ok: true, message: t.inventory.stockSaved };
  });
}
