"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { createOrder, deleteOrder, setOrderStatus, updateOrder } from "@/server/services/orders";
import { newOrderSchema, orderSchema, orderStatusSchema } from "@/server/validation";
import { getT } from "@/i18n/server";
import { handleAction, handleForm, type FormState } from "./form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Both roles. */
export async function createOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleForm(fd, newOrderSchema, async (input) => {
    const id = await createOrder(user.id, groupId, input);
    redirect(`/groups/${groupId}/orders/${id}?notice=saved`);
  });
}

export async function updateOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), orderId = str(fd, "orderId");
  return handleForm(fd, orderSchema, async (input) => {
    await updateOrder(user.id, groupId, orderId, input);
    redirect(`/groups/${groupId}/orders/${orderId}?notice=saved`);
  });
}

export async function deleteOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await deleteOrder(user.id, groupId, str(fd, "orderId"));
    redirect(`/groups/${groupId}/orders?notice=deleted`);
  });
}

/** Both roles. */
export async function orderStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), orderId = str(fd, "orderId");
  return handleForm(fd, orderStatusSchema, async ({ status, addToStock }) => {
    await setOrderStatus(user.id, groupId, orderId, status, addToStock);
    revalidatePath("/", "layout");
    const { t } = await getT();
    return { ok: true, message: t.orders.statusSaved };
  });
}
