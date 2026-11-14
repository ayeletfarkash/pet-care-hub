import Link from "next/link";
import { listOrders } from "@/server/services/orders";
import { fmt, formatDate, type Dict } from "@/i18n";
import { getT } from "@/i18n/server";
import type { Locale } from "@/server/db/schema";
import { Notice } from "@/components/notice";
import { Badge, Empty, orderTone, priceText, SectionHeader } from "@/components/care";
import { loadGroup } from "../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.orders.title };
}

type O = Awaited<ReturnType<typeof listOrders>>["orders"][number];

function OrderCard({ t, locale, groupId, o }: { t: Dict; locale: Locale; groupId: string; o: O }) {
  const k = t.orders;
  return (
    <li className="card relative rounded-xl border-2 border-divider bg-surface p-4 hover:border-line has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-[var(--focus)]">
      <h3 className="text-lg font-bold">
        <Link href={`/groups/${groupId}/orders/${o.id}`} className="text-fg after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{o.product}</Link>
      </h3>
      <p className="text-sm text-muted">
        {formatDate(locale, o.orderDate)}{o.vendor ? ` · ${o.vendor}` : ""}{o.price != null && <> · <span className="ltr-value">{priceText(locale, o.price)}</span></>}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-2">
        <Badge tone={orderTone[o.status]}>{k.statuses[o.status]}</Badge>
        {o.status === "delivered" && o.deliveredAt && <span className="text-sm text-muted">{fmt(k.deliveredOn, { date: formatDate(locale, o.deliveredAt.slice(0, 10)) })}</span>}
        {o.status !== "delivered" && o.status !== "cancelled" && o.expectedDelivery && <span className="text-sm text-muted">{fmt(k.expected, { date: formatDate(locale, o.expectedDelivery) })}</span>}
      </p>
    </li>
  );
}

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId } = await params;
  const [{ user }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { orders } = await listOrders(user.id, groupId);
  const k = t.orders;
  const open = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  const closed = orders.filter((o) => o.status === "delivered" || o.status === "cancelled");
  return (
    <>
      <Notice t={t} notice={sp.notice} />
      <SectionHeader as="h1" id="orders-h" title={k.title} action={{ href: `/groups/${groupId}/orders/new`, label: k.add }} />
      <p className="mb-6 text-muted">{k.intro}</p>
      <section aria-labelledby="open-h" className="mb-8">
        <h2 id="open-h" className="mb-3 text-2xl font-bold">{k.open}</h2>
        {open.length === 0 ? <Empty>{k.empty}</Empty> : <ul className="grid gap-3 sm:grid-cols-2">{open.map((o) => <OrderCard key={o.id} t={t} locale={locale} groupId={groupId} o={o} />)}</ul>}
      </section>
      <section aria-labelledby="closed-h">
        <h2 id="closed-h" className="mb-3 text-2xl font-bold">{k.closed}</h2>
        {closed.length === 0 ? <p className="text-muted">{k.emptyClosed}</p> : <ul className="grid gap-3 sm:grid-cols-2">{closed.map((o) => <OrderCard key={o.id} t={t} locale={locale} groupId={groupId} o={o} />)}</ul>}
      </section>
    </>
  );
}
