import { notFound } from "next/navigation";
import { getRoutine, routineHistory } from "@/server/services/routines";
import { listMembers } from "@/server/services/members";
import { AppError } from "@/server/errors";
import { todayLocal } from "@/server/schedule";
import { fmt, formatDate, formatLocalDateTime } from "@/i18n";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/notice";
import { activityTone, Badge } from "@/components/care";
import { LinkButton } from "@/components/ui/buttons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/forms/action-form";
import { ExtraActivityForm } from "@/components/forms/care-forms";
import { deleteRoutineAction, endRoutineAction, logActivityAction, removeLogAction } from "@/app/actions/routines";
import { planSummary } from "../../medications/summary";
import { loadGroup } from "../../load";
import { ReminderSection } from "@/components/reminder-section";

export default async function RoutinePage({ params, searchParams }: { params: Promise<{ groupId: string; routineId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId, routineId } = await params;
  const [{ user }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { routine: x } = await getRoutine(user.id, groupId, routineId).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const [history, members] = await Promise.all([routineHistory(user.id, groupId, routineId), listMembers(user.id, groupId)]);
  const r = t.routines, m = t.meds;
  const active = !x.endDate || x.endDate >= todayLocal();
  const responsible = members.find((u) => u.userId === x.responsibleUserId)?.name;
  const th = "border-b-2 border-line px-3 py-2 text-start font-semibold";
  const td = "border-b border-divider px-3 py-2";
  return (
    <div className="mx-auto max-w-3xl">
      <Notice t={t} notice={sp.notice} />
      <BackLink href={`/groups/${groupId}/routines`} label={r.title} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{x.name}</h1>
          <p className="mt-1"><Badge tone={active ? "success" : "neutral"}>{active ? r.active : r.ended}</Badge></p>
        </div>
        <LinkButton variant="secondary" href={`/groups/${groupId}/routines/${routineId}/edit`}>{t.ui.edit}</LinkButton>
      </div>
      <dl className="card mb-6 grid gap-x-6 gap-y-3 rounded-xl border-2 border-divider bg-surface p-5 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        <dt className="font-semibold text-muted">{r.schedule}</dt>
        <dd>
          {planSummary(t, locale, x)}
          <br />
          <span className="text-sm text-muted">
            {x.endDate ? fmt(m.periodUntil, { from: formatDate(locale, x.startDate), to: formatDate(locale, x.endDate) }) : fmt(m.period, { from: formatDate(locale, x.startDate) })}
          </span>
        </dd>
        <dt className="font-semibold text-muted">{r.responsible}</dt><dd>{responsible ?? t.ui.nobody}</dd>
        {x.description && <><dt className="font-semibold text-muted">{r.description}</dt><dd className="whitespace-pre-wrap">{x.description}</dd></>}
      </dl>

      {active && (
        <section aria-labelledby="extra-h" className="card mb-8 rounded-xl border-2 border-divider bg-surface p-5">
          <h2 id="extra-h" className="mb-3 text-xl font-bold">{r.logExtra}</h2>
          <ExtraActivityForm t={t} action={logActivityAction} hidden={{ groupId, routineId }} />
        </section>
      )}

      <ReminderSection t={t} userId={user.id} groupId={groupId} sourceType="routine" sourceId={routineId} />

      <section aria-labelledby="hist-h" className="mb-8">
        <h2 id="hist-h" className="mb-3 text-2xl font-bold">{r.history}</h2>
        {history.length === 0 ? <p className="text-muted">{r.historyEmpty}</p> : (
          <div role="region" aria-labelledby="hist-h" tabIndex={0} className="overflow-x-auto rounded-xl border-2 border-divider bg-surface">
            <table className="w-full min-w-[36rem] border-collapse">
              <caption className="sr-only">{r.history}</caption>
              <thead><tr>
                <th scope="col" className={th}>{r.scheduledFor}</th><th scope="col" className={th}>{t.tasks.status}</th>
                <th scope="col" className={th}>{r.loggedAt}</th><th scope="col" className={th}>{t.ui.by}</th><th scope="col" className={th}>{t.ui.notes}</th>
                <th scope="col" className={th}><span className="sr-only">{t.members.actions}</span></th>
              </tr></thead>
              <tbody>
                {history.map((h) => {
                  const when = h.scheduledFor ? formatLocalDateTime(locale, h.scheduledFor) : r.extra;
                  return (
                    <tr key={h.id}>
                      <td className={td}>{when}</td>
                      <td className={td}><Badge tone={activityTone[h.status]}>{r.status[h.status]}</Badge></td>
                      <td className={td}>{formatLocalDateTime(locale, h.at)}</td>
                      <td className={td}>{h.byName ?? t.ui.formerMember}</td>
                      <td className={td}>{h.notes}</td>
                      <td className={td}>
                        <ActionForm action={removeLogAction} fields={{ groupId, logId: h.id }} label={r.removeLog}
                          ariaLabel={fmt(r.removeLogLabel, { time: h.scheduledFor ? when : formatLocalDateTime(locale, h.at) })} pendingLabel={t.common.saving} variant="ghost" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3 border-t-2 border-divider pt-6">
        {active && (
          <ConfirmDialog triggerLabel={r.endRoutine} triggerVariant="secondary" cancelLabel={t.common.cancel} title={fmt(r.endTitle, { name: x.name })} body={r.endBody}>
            <ActionForm action={endRoutineAction} fields={{ groupId, routineId }} label={r.endRoutine} pendingLabel={t.common.saving} variant="danger" />
          </ConfirmDialog>
        )}
        <ConfirmDialog triggerLabel={r.deleteRoutine} cancelLabel={t.common.cancel} title={fmt(r.deleteTitle, { name: x.name })} body={r.deleteBody}>
          <ActionForm action={deleteRoutineAction} fields={{ groupId, routineId }} label={r.deleteRoutine} pendingLabel={t.common.saving} variant="danger" />
        </ConfirmDialog>
      </div>
    </div>
  );
}
