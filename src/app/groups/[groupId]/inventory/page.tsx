import Link from "next/link";
import { listItems } from "@/server/services/inventory";
import { fmt, formatDate } from "@/i18n";
import { getT } from "@/i18n/server";
import { Notice } from "@/components/notice";
import { Empty, qtyText, SectionHeader, StockBadge } from "@/components/care";
import { loadGroup } from "../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.inventory.title };
}

export default async function InventoryPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId } = await params;
  const [{ user, role, pet }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { items } = await listItems(user.id, groupId);
  const k = t.inventory;
  // Items to reorder first, then by name (already sorted by name).
  const sorted = [...items].sort((a, b) => Number(b.needsReorder) - Number(a.needsReorder));
  return (
    <>
      <Notice t={t} notice={sp.notice} />
      <SectionHeader as="h1" id="inv-h" title={k.title} action={role === "admin" ? { href: `/groups/${groupId}/inventory/new`, label: k.add } : undefined} />
      <p className="mb-6 text-muted">{fmt(k.intro, { pet: pet.name })}</p>
      {sorted.length === 0 ? <Empty>{k.empty}</Empty> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sorted.map((i) => (
            <li key={i.id} className="card relative rounded-xl border-2 border-divider bg-surface p-4 hover:border-line has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-[var(--focus)]">
              <h2 className="text-lg font-bold">
                <Link href={`/groups/${groupId}/inventory/${i.id}`} className="text-fg after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{i.name}</Link>
              </h2>
              <p className="text-sm text-muted">{k.types[i.type]}{i.brand ? ` · ${i.brand}` : ""}</p>
              <p className="mt-1 font-semibold">{k.inStock}: <span className="ltr-value">{qtyText(locale, i.quantity, i.unit)}</span></p>
              {i.runOutDate && <p className="text-sm">{fmt(k.runsOut, { date: formatDate(locale, i.runOutDate) })}</p>}
              <p className="mt-1"><StockBadge t={t} item={i} /></p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
