import Link from "next/link";
import { groupDoses, listPlans, recentWindow } from "@/server/services/medications";
import { todayLocal } from "@/server/schedule";
import { formatDate } from "@/i18n";
import { getT } from "@/i18n/server";
import { Notice } from "@/components/notice";
import { Badge, DoseItem, Empty, SectionHeader } from "@/components/care";
import { planSummary } from "./summary";
import { loadGroup } from "../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.meds.title };
}

export default async function MedicationsPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId } = await params;
  const [{ user }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { from } = recentWindow(), today = todayLocal();
  const [{ plans }, doses] = await Promise.all([listPlans(user.id, groupId), groupDoses(user.id, groupId, from, today)]);
  const m = t.meds;
  const todays = doses.filter((d) => d.scheduledFor.startsWith(today));
  const missed = doses.filter((d) => d.status === "missed" && !d.scheduledFor.startsWith(today)).reverse();
  return (
    <>
      <Notice t={t} notice={sp.notice} />
      <SectionHeader as="h1" id="meds-h" title={m.title} action={{ href: `/groups/${groupId}/medications/new`, label: m.newPlan }} />
      <p role="note" className="mb-6 rounded-lg border-2 border-line bg-accent p-3 text-sm">{m.disclaimer}</p>

      <section aria-labelledby="today-h" className="mb-8">
        <h2 id="today-h" className="mb-3 text-2xl font-bold">{m.today}</h2>
        {todays.length === 0 ? <Empty>{m.noDosesToday}</Empty> : (
          <ul className="space-y-2">{todays.map((d) => <DoseItem key={d.planId + d.scheduledFor} t={t} locale={locale} dose={d} />)}</ul>
        )}
      </section>

      {missed.length > 0 && (
        <section aria-labelledby="missed-h" className="mb-8">
          <h2 id="missed-h" className="mb-3 text-2xl font-bold">{m.missed}</h2>
          <ul className="space-y-2">{missed.map((d) => <DoseItem key={d.planId + d.scheduledFor} t={t} locale={locale} dose={d} showDate />)}</ul>
        </section>
      )}

      <section aria-labelledby="plans-h">
        <h2 id="plans-h" className="mb-3 text-2xl font-bold">{m.plans}</h2>
        {plans.length === 0 ? <Empty>{m.noPlans}</Empty> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <li key={p.id} className="card relative rounded-xl border-2 border-divider bg-surface p-4 hover:border-line has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-[var(--focus)]">
                <h3 className="text-lg font-bold">
                  <Link href={`/groups/${groupId}/medications/${p.id}`} className="text-fg after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{p.name}</Link>
                </h3>
                <p>{p.dosage}</p>
                <p className="text-sm text-muted">{planSummary(t, locale, p)}</p>
                <p className="mt-1 flex flex-wrap gap-2">
                  <Badge tone={p.active ? "success" : "neutral"}>{p.active ? m.active : m.ended}</Badge>
                  {p.endDate && <span className="text-sm text-muted">{formatDate(locale, p.endDate)}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
