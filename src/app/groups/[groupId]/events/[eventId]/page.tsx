import { notFound } from "next/navigation";
import { getEvent } from "@/server/services/events";
import { AppError } from "@/server/errors";
import { addDays, occurrences, todayLocal } from "@/server/schedule";
import { fmt, formatDate, formatLocalDateTime } from "@/i18n";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/care";
import { LinkButton } from "@/components/ui/buttons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/forms/action-form";
import { deleteEventAction, occurrenceStatusAction } from "@/app/actions/events";
import { loadGroup } from "../../load";

export default async function EventPage({ params, searchParams }: { params: Promise<{ groupId: string; eventId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId, eventId } = await params;
  const [{ user }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { event: e, assigneeName, statuses, role } = await getEvent(user.id, groupId, eventId).catch((x) => { if (x instanceof AppError) notFound(); throw x; });
  const ev = t.events, isAdmin = role === "admin";
  const today = todayLocal();
  // The next few occurrences (from today, up to a year ahead), with their status.
  const next = occurrences(e.startsAt, e.recurrence, e.recurrenceUntil, today, addDays(today, 366), 6);
  const st = new Map(statuses.map((s) => [s.occurrence, s.status]));
  const when = (at: string) => (e.allDay ? `${formatDate(locale, at.slice(0, 10))} · ${ev.allDay}` : formatLocalDateTime(locale, at));
  const row = (label: string, value: string | null | undefined) => value && (<><dt className="font-semibold text-muted">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></>);
  return (
    <div className="mx-auto max-w-3xl">
      <Notice t={t} notice={sp.notice} />
      <BackLink href={`/groups/${groupId}/calendar`} label={ev.title} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{e.title}</h1>
          <p className="mt-1 flex flex-wrap gap-2"><Badge>{ev.types[e.type]}</Badge><Badge>{ev.recurrences[e.recurrence]}</Badge></p>
        </div>
        {isAdmin && <LinkButton variant="secondary" href={`/groups/${groupId}/events/${eventId}/edit`}>{t.ui.edit}</LinkButton>}
      </div>
      <dl className="card mb-6 grid gap-x-6 gap-y-3 rounded-xl border-2 border-divider bg-surface p-5 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        {row(ev.date, when(e.startsAt))}
        {row(ev.until, e.recurrenceUntil && formatDate(locale, e.recurrenceUntil))}
        {row(ev.location, e.location)}
        {row(ev.provider, e.provider)}
        {row(ev.assignee, assigneeName ?? t.ui.nobody)}
        {row(ev.description, e.description)}
        {row(t.ui.notes, e.notes)}
      </dl>

      {next.length > 0 && (
        <section aria-labelledby="next-h" className="mb-8">
          <h2 id="next-h" className="mb-3 text-2xl font-bold">{ev.upcoming}</h2>
          <ul className="space-y-2">
            {next.map((at) => {
              const s = st.get(at);
              const fields = { groupId, eventId, occurrence: at };
              const label = { title: e.title, date: when(at) };
              return (
                <li key={at} className="card flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-divider bg-surface p-3">
                  <span className="font-semibold">{when(at)} {s && <Badge tone={s === "completed" ? "success" : "danger"}>{ev.statusLabel[s]}</Badge>}</span>
                  <div className="flex flex-wrap gap-2">
                    {!s ? (
                      <>
                        <ActionForm action={occurrenceStatusAction} fields={{ ...fields, status: "completed" }} label={ev.complete} ariaLabel={fmt(ev.completeLabel, label)} pendingLabel={t.common.saving} />
                        <ActionForm action={occurrenceStatusAction} fields={{ ...fields, status: "cancelled" }} label={ev.cancel} ariaLabel={fmt(ev.cancelLabel, label)} pendingLabel={t.common.saving} variant="ghost" />
                      </>
                    ) : (
                      <ActionForm action={occurrenceStatusAction} fields={{ ...fields, status: "" }} label={ev.reopen} ariaLabel={fmt(ev.reopenLabel, label)} pendingLabel={t.common.saving} variant="ghost" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {isAdmin && (
        <ConfirmDialog triggerLabel={ev.deleteEvent} cancelLabel={t.common.cancel} title={fmt(ev.deleteTitle, { title: e.title })} body={ev.deleteBody}>
          <ActionForm action={deleteEventAction} fields={{ groupId, eventId }} label={ev.deleteEvent} pendingLabel={t.common.saving} variant="danger" />
        </ConfirmDialog>
      )}
    </div>
  );
}
