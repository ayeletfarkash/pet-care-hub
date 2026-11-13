import { listItems } from "@/server/services/inventory";
import { todayLocal } from "@/server/schedule";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { OrderForm } from "@/components/forms/care-forms";
import { createOrderAction } from "@/app/actions/orders";
import { loadGroup } from "../../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.orders.createTitle };
}

/** Both roles can add orders (PRD §9.4). `?item=` preselects the inventory product. */
export default async function NewOrderPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ item?: string }> }) {
  const { groupId } = await params;
  const [{ user }, { t }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { items } = await listItems(user.id, groupId);
  const pre = items.find((i) => i.id === sp.item);
  const today = todayLocal();
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/orders`} label={t.orders.title} />
      <h1 className="mb-6 text-3xl font-bold">{t.orders.createTitle}</h1>
      <OrderForm t={t} action={createOrderAction} hidden={{ groupId }} items={items.map((i) => ({ value: i.id, label: i.name }))} submitLabel={t.common.save}
        today={today} withStatus initial={pre ? { orderDate: today, status: "ordered", itemId: pre.id, product: pre.name, vendor: pre.vendor ?? "" } : undefined} />
    </div>
  );
}
