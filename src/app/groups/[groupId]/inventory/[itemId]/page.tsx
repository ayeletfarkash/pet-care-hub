import Link from "next/link";
import { notFound } from "next/navigation";
import { getItem } from "@/server/services/inventory";
import { AppError } from "@/server/errors";
import { fmt, formatDate, formatDateTime, formatNumber } from "@/i18n";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/notice";
import { priceText, qtyText, StockBadge } from "@/components/care";
import { LinkButton } from "@/components/ui/buttons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/forms/action-form";
import { StockForm } from "@/components/forms/care-forms";
import { changeStockAction, deleteItemAction } from "@/app/actions/inventory";
import { loadGroup } from "../../load";

export default async function ItemPage({ params, searchParams }: { params: Promise<{ groupId: string; itemId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId, itemId } = await params;
  const [{ user }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { item: i, history } = await getItem(user.id, groupId, itemId).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const k = t.inventory;
  const q = (n: number) => qtyText(locale, n, i.unit);
  const th = "border-b-2 border-line px-3 py-2 text-start font-semibold";
  const td = "border-b border-divider px-3 py-2";
  const row = (label: string, value: React.ReactNode) => <><dt className="font-semibold text-muted">{label}</dt><dd>{value}</dd></>;
  return (
    <div className="mx-auto max-w-3xl">
      <Notice t={t} notice={sp.notice} />
      <BackLink href={`/groups/${groupId}/inventory`} label={k.title} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{i.name}</h1>
          <p className="mt-1"><StockBadge t={t} item={i} /></p>
        </div>
        <div className="flex flex-wrap gap-2">
          {i.needsReorder && <LinkButton variant="secondary" href={`/groups/${groupId}/orders/new?item=${itemId}`}>{t.orders.add}</LinkButton>}
          <LinkButton variant="secondary" href={`/groups/${groupId}/inventory/${itemId}/edit`}>{t.ui.edit}</LinkButton>
        </div>
      </div>
      <dl className="card mb-6 grid gap-x-6 gap-y-3 rounded-xl border-2 border-divider bg-surface p-5 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        {row(k.inStock, <span className="ltr-value font-bold">{q(i.quantity)}</span>)}
        {row(k.dailyUsage, i.dailyUsage ? (
          <>
            <span className="ltr-value">{q(i.dailyUsage)}</span>
            {i.daysLeft != null && i.runOutDate && <><br /><span>{fmt(k.daysLeft, { n: i.daysLeft })} · {fmt(k.runsOut, { date: formatDate(locale, i.runOutDate) })}</span></>}
          </>
        ) : <span className="text-muted">{k.noEstimate}</span>)}
        {i.lowStockThreshold != null && row(k.threshold, <span className="ltr-value">{q(i.lowStockThreshold)}</span>)}
        {row(k.type, k.types[i.type])}
        {i.brand && row(k.brand, i.brand)}
        {i.packageSize != null && row(k.packageSize, <span className="ltr-value">{q(i.packageSize)}</span>)}
        {i.vendor && row(k.vendor, i.vendor)}
        {i.price != null && row(k.price, <span className="ltr-value">{priceText(locale, i.price)}</span>)}
        {i.purchaseDate && row(k.purchaseDate, formatDate(locale, i.purchaseDate))}
        {i.planName && i.medicationPlanId && row(k.plan, <Link href={`/groups/${groupId}/medications/${i.medicationPlanId}`}>{i.planName}</Link>)}
        {i.notes && row(t.ui.notes, <span className="whitespace-pre-wrap">{i.notes}</span>)}
      </dl>

      <section aria-labelledby="stock-h" className="card mb-8 rounded-xl border-2 border-divider bg-surface p-5">
        <h2 id="stock-h" className="mb-3 text-xl font-bold">{k.update}</h2>
        <StockForm t={t} action={changeStockAction} hidden={{ groupId, itemId }} />
      </section>

      <section aria-labelledby="hist-h" className="mb-8">
        <h2 id="hist-h" className="mb-3 text-2xl font-bold">{k.history}</h2>
        {history.length === 0 ? <p className="text-muted">{k.historyEmpty}</p> : (
          <div role="region" aria-labelledby="hist-h" tabIndex={0} className="overflow-x-auto rounded-xl border-2 border-divider bg-surface">
            <table className="w-full min-w-[36rem] border-collapse">
              <caption className="sr-only">{k.history}</caption>
              <thead><tr>
                <th scope="col" className={th}>{k.when}</th><th scope="col" className={th}>{k.kind}</th><th scope="col" className={th}>{k.change}</th>
                <th scope="col" className={th}>{k.after}</th><th scope="col" className={th}>{t.ui.by}</th><th scope="col" className={th}>{k.note}</th>
              </tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className={td}>{formatDateTime(locale, h.createdAt)}</td>
                    <td className={td}>{k.movementKinds[h.kind]}</td>
                    <td className={td}><span className="ltr-value">{h.delta > 0 ? "+" : ""}{formatNumber(locale, h.delta)}</span></td>
                    <td className={td}><span className="ltr-value">{q(h.quantityAfter)}</span></td>
                    <td className={td}>{h.byName ?? t.ui.formerMember}</td>
                    <td className={td}>{h.orderId ? <Link href={`/groups/${groupId}/orders/${h.orderId}`}>{h.note ?? k.fromOrder}</Link> : h.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3 border-t-2 border-divider pt-6">
        <ConfirmDialog triggerLabel={k.deleteItem} cancelLabel={t.common.cancel} title={fmt(k.deleteTitle, { name: i.name })} body={k.deleteBody}>
          <ActionForm action={deleteItemAction} fields={{ groupId, itemId }} label={k.deleteItem} pendingLabel={t.common.saving} variant="danger" />
        </ConfirmDialog>
      </div>
    </div>
  );
}
