import { notFound } from "next/navigation";
import { getOrder } from "@/server/services/orders";
import { listItems } from "@/server/services/inventory";
import { todayLocal } from "@/server/schedule";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { OrderForm } from "@/components/forms/care-forms";
import { updateOrderAction } from "@/app/actions/orders";
import { loadGroup } from "../../../load";

export default async function EditOrderPage({ params }: { params: Promise<{ groupId: string; orderId: string }> }) {
  const { groupId, orderId } = await params;
  const [{ user }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  const [{ order }, { items }] = await Promise.all([getOrder(user.id, groupId, orderId).catch(() => notFound()), listItems(user.id, groupId)]);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/orders/${orderId}`} label={order.product} />
      <h1 className="mb-6 text-3xl font-bold">{t.orders.editTitle}</h1>
      <OrderForm t={t} action={updateOrderAction} hidden={{ groupId, orderId }} initial={order}
        items={items.map((i) => ({ value: i.id, label: i.name }))} submitLabel={t.common.save} today={todayLocal()} />
    </div>
  );
}
