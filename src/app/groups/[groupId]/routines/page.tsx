import Link from "next/link";
import { groupActivities, listRoutines } from "@/server/services/routines";
import { addDays, todayLocal } from "@/server/schedule";
import { fmt, formatDate } from "@/i18n";
import { getT } from "@/i18n/server";
import { Notice } from "@/components/notice";
import { ActivityItem, Badge, Empty, SectionHeader } from "@/components/care";
import { planSummary } from "../medications/summary";
import { loadGroup } from "../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.routines.title };
}

export default async function RoutinesPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId } = await params;
  const [{ user, role }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const today = todayLocal();
  // Caregivers can log up to 48 h back, so unlogged activities from the last 2 days are offered.
  const [{ routines }, acts] = await Promise.all([listRoutines(user.id, groupId), groupActivities(user.id, groupId, addDays(today, -2), today)]);
  const r = t.routines;
  const todays = acts.filter((a) => a.scheduledFor.startsWith(today));
  const recent = acts.filter((a) => a.status === "not_logged" && !a.scheduledFor.startsWith(today)).reverse();
  return (
    <>
      <Notice t={t} notice={sp.notice} />
      <SectionHeader as="h1" id="routines-h" title={r.title} action={role === "admin" ? { href: `/groups/${groupId}/routines/new`, label: r.add } : undefined} />
      <p className="mb-6 text-muted">{r.intro}</p>

      <section aria-labelledby="today-h" className="mb-8">
        <h2 id="today-h" className="mb-3 text-2xl font-bold">{r.today}</h2>
        {todays.length === 0 ? <Empty>{r.noToday}</Empty> : (
          <ul className="space-y-2">{todays.map((a) => <ActivityItem key={a.routineId + a.scheduledFor} t={t} locale={locale} a={a} />)}</ul>
        )}
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-h" className="mb-8">
          <h2 id="recent-h" className="mb-3 text-2xl font-bold">{r.recent}</h2>
          <ul className="space-y-2">{recent.map((a) => <ActivityItem key={a.routineId + a.scheduledFor} t={t} locale={locale} a={a} showDate />)}</ul>
        </section>
      )}

      <section aria-labelledby="list-h">
        <h2 id="list-h" className="mb-3 text-2xl font-bold">{r.list}</h2>
        {routines.length === 0 ? <Empty>{r.empty}</Empty> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {routines.map((x) => (
              <li key={x.id} className="card relative rounded-xl border-2 border-divider bg-surface p-4 hover:border-line has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-[var(--focus)]">
                <h3 className="text-lg font-bold">
                  <Link href={`/groups/${groupId}/routines/${x.id}`} className="text-fg after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{x.name}</Link>
                </h3>
                <p className="text-sm text-muted">{planSummary(t, locale, x)}</p>
                <p className="text-sm">{r.responsible}: {x.responsibleName ?? t.ui.nobody}</p>
                <p className="mt-1 flex flex-wrap gap-2">
                  <Badge tone={x.active ? "success" : "neutral"}>{x.active ? r.active : r.ended}</Badge>
                  {x.endDate && <span className="text-sm text-muted">{fmt(t.meds.periodUntil, { from: formatDate(locale, x.startDate), to: formatDate(locale, x.endDate) })}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
