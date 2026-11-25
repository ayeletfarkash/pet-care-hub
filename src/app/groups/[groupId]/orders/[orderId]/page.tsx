import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/server/services/orders";
import { AppError } from "@/server/errors";
import { fmt, formatDate, formatLocalDateTime } from "@/i18n";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/notice";
import { Badge, orderTone, priceText, qtyText } from "@/components/care";
import { LinkButton } from "@/components/ui/buttons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/forms/action-form";
import { OrderStatusForm } from "@/components/forms/care-forms";
import { deleteOrderAction, orderStatusAction } from "@/app/actions/orders";
import { loadGroup } from "../../load";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ groupId: string; orderId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId, orderId } = await params;
  const [{ user }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { order: o } = await getOrder(user.id, groupId, orderId).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const k = t.orders;
  const canStock = !!o.itemId && !!o.itemName && !!o.quantity && o.quantity > 0 && !o.addedToStock;
  const row = (label: string, value: React.ReactNode) => <><dt className="font-semibold text-muted">{label}</dt><dd>{value}</dd></>;
  return (
    <div className="mx-auto max-w-3xl">
      <Notice t={t} notice={sp.notice} />
      <BackLink href={`/groups/${groupId}/orders`} label={k.title} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{o.product}</h1>
          <p className="mt-1"><Badge tone={orderTone[o.status]}>{k.statuses[o.status]}</Badge></p>
        </div>
        <LinkButton variant="secondary" href={`/groups/${groupId}/orders/${orderId}/edit`}>{t.ui.edit}</LinkButton>
      </div>
      <dl className="card mb-6 grid gap-x-6 gap-y-3 rounded-xl border-2 border-divider bg-surface p-5 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        {row(k.orderDate, formatDate(locale, o.orderDate))}
        {o.expectedDelivery && row(k.expectedDelivery, formatDate(locale, o.expectedDelivery))}
        {o.deliveredAt && row(k.statuses.delivered, formatLocalDateTime(locale, o.deliveredAt))}
        {o.quantity != null && row(k.quantity, <span className="ltr-value">{qtyText(locale, o.quantity, o.itemUnit)}</span>)}
        {o.price != null && row(k.price, <span className="ltr-value">{priceText(locale, o.price)}</span>)}
        {o.vendor && row(k.vendor, o.vendor)}
        {o.url && row(k.url, <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="break-all">{o.url}<span aria-hidden="true"> ↗</span><span className="sr-only"> ({k.openLink})</span></a>)}
        {o.itemId && o.itemName && row(k.item, <>
          <Link href={`/groups/${groupId}/inventory/${o.itemId}`}>{o.itemName}</Link>
          {o.addedToStock && <> · <Badge tone="success">{k.addedToStock}</Badge></>}
        </>)}
        {o.notes && row(t.ui.notes, <span className="whitespace-pre-wrap">{o.notes}</span>)}
      </dl>

      <section aria-labelledby="status-h" className="card mb-8 rounded-xl border-2 border-divider bg-surface p-5">
        <h2 id="status-h" className="mb-3 text-xl font-bold">{k.updateStatus}</h2>
        <OrderStatusForm t={t} action={orderStatusAction} hidden={{ groupId, orderId }} status={o.status}
          stockLabel={canStock ? fmt(k.addToStock, { qty: qtyText(locale, o.quantity!, o.itemUnit), item: o.itemName! }) : undefined} />
      </section>

      <div className="flex flex-wrap gap-3 border-t-2 border-divider pt-6">
        <ConfirmDialog triggerLabel={k.deleteOrder} cancelLabel={t.common.cancel} title={fmt(k.deleteTitle, { name: o.product })} body={k.deleteBody}>
          <ActionForm action={deleteOrderAction} fields={{ groupId, orderId }} label={k.deleteOrder} pendingLabel={t.common.saving} variant="danger" />
        </ConfirmDialog>
      </div>
    </div>
  );
}
