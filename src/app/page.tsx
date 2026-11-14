import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { listRestorableGroups, listUserGroups } from "@/server/services/groups";
import { fmt, formatDate } from "@/i18n";
import { getT } from "@/i18n/server";
import { Notice } from "@/components/notice";
import { SpeciesIcon } from "@/components/species-icon";
import { LinkButton } from "@/components/ui/buttons";
import { ActionForm } from "@/components/forms/action-form";
import { groupTaskStats, Today } from "@/components/today";
import { insightsFor } from "@/server/services/insights";
import { restoreGroupAction } from "./actions/groups";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string; reason?: string }> }) {
  const user = await requireUser();
  const [{ t, locale }, sp, groups, restorable] = await Promise.all([
    getT(), searchParams, listUserGroups(user.id), listRestorableGroups(user.id),
  ]);
  const admins = groups.filter((g) => g.role === "admin").length;
  const [stats, insights] = await Promise.all([groupTaskStats(groups.map((g) => g.groupId)), groups.length ? insightsFor(user.id) : []]);
  // At a glance: only what needs action (upcoming items are already in Today).
  const attention = insights.filter((i) => ["overdue_tasks", "struggling_series", "low_stock", "running_out", "missed_activities"].includes(i.kind));
  const petOf = new Map(groups.map((g) => [g.groupId, g.petName]));

  return (
    <>
      <Notice t={t} notice={sp.notice} reason={sp.reason} />
      <h1 className="text-3xl font-bold">{fmt(t.dashboard.greeting, { name: user.name })}</h1>
      {groups.length > 0 && <p className="mt-1 text-muted">{fmt(t.dashboard.summary, { count: groups.length, admins })}</p>}
      {groups.length > 0 && (
        <section aria-labelledby="glance-h" className="mt-8">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 id="glance-h" className="text-2xl font-bold">{t.insights.glance}</h2>
            <Link href="/insights" className="font-semibold">{t.insights.openAll}</Link>
          </div>
          <p className="mb-3 text-muted">{t.insights.glanceIntro}</p>
          {attention.length === 0 ? <p className="text-muted">{t.insights.glanceNone}</p> : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {attention.map((i) => (
                <li key={i.groupId + i.kind} className="card rounded-xl border-2 border-divider bg-surface p-3">
                  <Link href={`/insights?group=${i.groupId}&category=${i.category}`} className="font-semibold">{petOf.get(i.groupId)}: {fmt(t.insights.kinds[i.kind], { count: i.items.length })}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {groups.length > 0 && <Today t={t} locale={locale} userId={user.id} groups={groups} />}

      <section aria-labelledby="groups-h" className="mt-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 id="groups-h" className="text-2xl font-bold">{t.dashboard.groups}</h2>
          <LinkButton href="/groups/new"><span aria-hidden="true">＋</span>{t.dashboard.create}</LinkButton>
        </div>
        <p className="mb-4 text-muted">{t.dashboard.groupsIntro}</p>
        {groups.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-line bg-surface p-6">{t.dashboard.empty}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <li key={g.groupId} className="card relative flex items-center gap-4 rounded-xl border-2 border-divider bg-surface p-4 hover:border-line has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-[var(--focus)]">
                {g.hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- auth-protected route, not optimizable
                  <img src={`/groups/${g.groupId}/photo`} alt="" className="size-14 shrink-0 rounded-full object-cover" />
                ) : (
                  <SpeciesIcon species={g.species} />
                )}
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-bold">
                    {/* Stretched link: the whole card is clickable, one tab stop. */}
                    <Link href={`/groups/${g.groupId}`} className="text-fg after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
                      {g.petName}
                    </Link>
                  </h3>
                  <p className="text-sm text-muted">
                    {g.species === "other" && g.speciesOther ? g.speciesOther : t.species[g.species]}
                  </p>
                  <p className="mt-1 inline-block rounded-full border border-line px-2 text-sm font-semibold">{t.roles[g.role]}</p>
                  <p className="mt-1 text-sm">{fmt(t.today.groupStats, { open: stats.get(g.groupId)?.open ?? 0, overdue: stats.get(g.groupId)?.overdue ?? 0 })}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {restorable.length > 0 && (
        <section aria-labelledby="restore-h" className="mt-10">
          <h2 id="restore-h" className="text-2xl font-bold">{t.dashboard.restorable}</h2>
          <p className="mb-4 text-muted">{t.dashboard.restorableIntro}</p>
          <ul className="space-y-3">
            {restorable.map((g) => (
              <li key={g.groupId} className="card flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-divider bg-surface p-4">
                <div>
                  <p className="font-bold">{g.petName}</p>
                  <p className="text-sm text-muted">{fmt(t.dashboard.deletedOn, { date: formatDate(locale, g.deletedAt!) })}</p>
                </div>
                <ActionForm action={restoreGroupAction} fields={{ groupId: g.groupId }}
                  label={fmt(t.dashboard.restore, { pet: g.petName })} pendingLabel={t.common.saving} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 rounded-xl bg-accent p-4 text-sm">{t.dashboard.moreSoon}</p>
    </>
  );
}
