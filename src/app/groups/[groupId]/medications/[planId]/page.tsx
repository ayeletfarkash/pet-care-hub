import { notFound } from "next/navigation";
import { administrationHistory, getPlan } from "@/server/services/medications";
import { listMembers } from "@/server/services/members";
import { AppError } from "@/server/errors";
import { todayLocal } from "@/server/schedule";
import { fmt, formatDate, formatLocalDateTime } from "@/i18n";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/care";
import { LinkButton } from "@/components/ui/buttons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/forms/action-form";
import { deletePlanAction, endPlanAction, removeDoseAction } from "@/app/actions/medications";
import { planSummary } from "../summary";
import { loadGroup } from "../../load";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ groupId: string; planId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId, planId } = await params;
  const [{ user }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { plan: p, role } = await getPlan(user.id, groupId, planId).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const [history, members] = await Promise.all([administrationHistory(user.id, groupId, planId), listMembers(user.id, groupId)]);
  const m = t.meds, isAdmin = role === "admin";
  const active = !p.endDate || p.endDate >= todayLocal();
  const responsible = members.find((x) => x.userId === p.responsibleUserId)?.name;
  const th = "border-b-2 border-line px-3 py-2 text-start font-semibold";
  const td = "border-b border-divider px-3 py-2";
  return (
    <div className="mx-auto max-w-3xl">
      <Notice t={t} notice={sp.notice} />
      <BackLink href={`/groups/${groupId}/medications`} label={m.title} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{p.name}</h1>
          <p className="mt-1"><Badge tone={active ? "success" : "neutral"}>{active ? m.active : m.ended}</Badge></p>
        </div>
        {isAdmin && <LinkButton variant="secondary" href={`/groups/${groupId}/medications/${planId}/edit`}>{t.ui.edit}</LinkButton>}
      </div>
      <dl className="card mb-6 grid gap-x-6 gap-y-3 rounded-xl border-2 border-divider bg-surface p-5 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        <dt className="font-semibold text-muted">{m.dosage}</dt><dd>{p.dosage}</dd>
        <dt className="font-semibold text-muted">{m.schedule}</dt>
        <dd>
          {planSummary(t, locale, p)}
          <br />
          <span className="text-sm text-muted">
            {p.endDate ? fmt(m.periodUntil, { from: formatDate(locale, p.startDate), to: formatDate(locale, p.endDate) }) : fmt(m.period, { from: formatDate(locale, p.startDate) })}
          </span>
        </dd>
        <dt className="font-semibold text-muted">{m.responsible}</dt><dd>{responsible ?? t.ui.nobody}</dd>
        {p.instructions && <><dt className="font-semibold text-muted">{m.instructions}</dt><dd className="whitespace-pre-wrap">{p.instructions}</dd></>}
        {p.notes && <><dt className="font-semibold text-muted">{t.ui.notes}</dt><dd className="whitespace-pre-wrap">{p.notes}</dd></>}
      </dl>

      <section aria-labelledby="hist-h" className="mb-8">
        <h2 id="hist-h" className="mb-3 text-2xl font-bold">{m.history}</h2>
        {history.length === 0 ? <p className="text-muted">{m.historyEmpty}</p> : (
          <div role="region" aria-labelledby="hist-h" tabIndex={0} className="overflow-x-auto rounded-xl border-2 border-divider bg-surface">
            <table className="w-full min-w-[32rem] border-collapse">
              <caption className="sr-only">{m.history}</caption>
              <thead><tr>
                <th scope="col" className={th}>{m.scheduledFor}</th><th scope="col" className={th}>{m.administeredAt}</th>
                <th scope="col" className={th}>{t.ui.by}</th><th scope="col" className={th}>{t.ui.notes}</th>
                {isAdmin && <th scope="col" className={th}><span className="sr-only">{t.members.actions}</span></th>}
              </tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className={td}>{formatLocalDateTime(locale, h.scheduledFor)}</td>
                    <td className={td}>{formatLocalDateTime(locale, h.administeredAt)}</td>
                    <td className={td}>{h.byName ?? t.ui.formerMember}</td>
                    <td className={td}>{h.notes}</td>
                    {isAdmin && (
                      <td className={td}>
                        <ActionForm action={removeDoseAction} fields={{ groupId, administrationId: h.id }} label={m.removeRecord}
                          ariaLabel={fmt(m.removeRecordLabel, { time: formatLocalDateTime(locale, h.scheduledFor) })} pendingLabel={t.common.saving} variant="ghost" />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && (
        <div className="flex flex-wrap gap-3 border-t-2 border-divider pt-6">
          {active && (
            <ConfirmDialog triggerLabel={m.endPlan} triggerVariant="secondary" cancelLabel={t.common.cancel} title={fmt(m.endTitle, { name: p.name })} body={m.endBody}>
              <ActionForm action={endPlanAction} fields={{ groupId, planId }} label={m.endPlan} pendingLabel={t.common.saving} variant="danger" />
            </ConfirmDialog>
          )}
          <ConfirmDialog triggerLabel={m.deletePlan} cancelLabel={t.common.cancel} title={fmt(m.deleteTitle, { name: p.name })} body={m.deleteBody}>
            <ActionForm action={deletePlanAction} fields={{ groupId, planId }} label={m.deletePlan} pendingLabel={t.common.saving} variant="danger" />
          </ConfirmDialog>
        </div>
      )}
    </div>
  );
}
