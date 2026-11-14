import Link from "next/link";
import { groupOccurrences, type Occurrence } from "@/server/services/events";
import { groupDoses, type Dose } from "@/server/services/medications";
import { openTasksForGroups } from "@/server/services/tasks";
import { monthRange, shiftMonth, todayLocal } from "@/server/schedule";
import { fmt, formatDayHeading, formatLocalTime, formatMonth, type Dict } from "@/i18n";
import { getT } from "@/i18n/server";
import type { Locale } from "@/server/db/schema";
import { Notice } from "@/components/notice";
import { Badge, DoseItem, Empty, SectionHeader } from "@/components/care";
import { ActionForm } from "@/components/forms/action-form";
import { occurrenceStatusAction } from "@/app/actions/events";
import { loadGroup } from "../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.events.title };
}

type Item =
  | { kind: "event"; at: string; o: Occurrence }
  | { kind: "dose"; at: string; d: Dose }
  | { kind: "task"; at: string; id: string; title: string; overdue: boolean };

function EventItem({ t, locale, o, groupId }: { t: Dict; locale: Locale; o: Occurrence; groupId: string }) {
  const ev = t.events;
  const date = formatDayHeading(locale, o.at.slice(0, 10));
  const fields = { groupId, eventId: o.eventId, occurrence: o.at };
  return (
    <li className="card flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-divider bg-surface p-3">
      <div>
        <p className="font-bold">
          <span className="ltr-value">{o.allDay ? ev.allDay : formatLocalTime(locale, o.at)}</span> ·{" "}
          <Link href={`/groups/${groupId}/events/${o.eventId}`} className={o.status === "cancelled" ? "line-through" : undefined}>{o.title}</Link>
        </p>
        <p className="mt-1 flex flex-wrap gap-2 text-sm">
          <Badge>{ev.types[o.type]}</Badge>
          {o.status !== "scheduled" && <Badge tone={o.status === "completed" ? "success" : "danger"}>{ev.statusLabel[o.status]}</Badge>}
          {o.location && <span className="text-muted">{o.location}</span>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {o.status === "scheduled" ? (
          <>
            <ActionForm action={occurrenceStatusAction} fields={{ ...fields, status: "completed" }} label={ev.complete}
              ariaLabel={fmt(ev.completeLabel, { title: o.title, date })} pendingLabel={t.common.saving} />
            <ActionForm action={occurrenceStatusAction} fields={{ ...fields, status: "cancelled" }} label={ev.cancel}
              ariaLabel={fmt(ev.cancelLabel, { title: o.title, date })} pendingLabel={t.common.saving} variant="ghost" />
          </>
        ) : (
          <ActionForm action={occurrenceStatusAction} fields={{ ...fields, status: "" }} label={ev.reopen}
            ariaLabel={fmt(ev.reopenLabel, { title: o.title, date })} pendingLabel={t.common.saving} variant="ghost" />
        )}
      </div>
    </li>
  );
}

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ month?: string; notice?: string }> }) {
  const { groupId } = await params;
  const [{ user, pet }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const today = todayLocal();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const { from, to } = monthRange(month);
  const [occ, doses, tasks] = await Promise.all([
    groupOccurrences(user.id, groupId, from, to),
    groupDoses(user.id, groupId, from, to),
    openTasksForGroups([groupId], { dueBefore: to }), // membership already checked by loadGroup
  ]);
  const items: Item[] = [
    ...occ.map((o) => ({ kind: "event" as const, at: o.at, o })),
    ...doses.map((d) => ({ kind: "dose" as const, at: d.scheduledFor, d })),
    ...tasks.filter((x) => x.dueAt && x.dueAt >= `${from}T00:00`).map((x) => ({ kind: "task" as const, at: x.dueAt!, id: x.id, title: x.title, overdue: x.overdue })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const days = [...new Set(items.map((i) => i.at.slice(0, 10)))];
  const ev = t.events;
  const nav = "inline-flex min-h-11 items-center rounded-lg border-2 border-line px-3 font-semibold no-underline hover:bg-accent hover:no-underline";

  return (
    <>
      <Notice t={t} notice={sp.notice} />
      <SectionHeader as="h1" id="cal-h" title={ev.title} action={{ href: `/groups/${groupId}/events/new`, label: ev.add }} />
      <p className="mb-4 text-muted">{fmt(ev.intro, { pet: pet.name })}</p>
      <nav aria-label={ev.monthNav} className="mb-6 flex flex-wrap items-center gap-2">
        <Link className={nav} href={`?month=${shiftMonth(month, -1)}`}><span aria-hidden="true" className="inline-block rtl:rotate-180">←</span>&nbsp;{ev.prev}</Link>
        <h2 className="mx-2 text-xl font-bold">{formatMonth(locale, month)}</h2>
        <Link className={nav} href={`?month=${shiftMonth(month, 1)}`}>{ev.next}&nbsp;<span aria-hidden="true" className="inline-block rtl:rotate-180">→</span></Link>
        {month !== today.slice(0, 7) && <Link className={nav} href="?">{ev.thisMonth}</Link>}
      </nav>
      {days.length === 0 ? <Empty>{ev.empty}</Empty> : (
        <div className="space-y-6">
          {days.map((day) => (
            <div key={day}>
              <h3 id={`d-${day}`} className="mb-2 text-lg font-bold">
                {formatDayHeading(locale, day)} {day === today && <Badge tone="info">{t.today.title}</Badge>}
              </h3>
              <ul className="space-y-2">
                {items.filter((i) => i.at.startsWith(day)).map((i) =>
                  i.kind === "event" ? <EventItem key={`e${i.o.eventId}${i.at}`} t={t} locale={locale} o={i.o} groupId={groupId} />
                  : i.kind === "dose" ? <DoseItem key={`d${i.d.planId}${i.at}`} t={t} locale={locale} dose={i.d} />
                  : (
                    <li key={`t${i.id}`} className="card flex flex-wrap items-center gap-2 rounded-xl border-2 border-divider bg-surface p-3">
                      <span className="ltr-value font-bold">{i.at.endsWith("23:59") ? "" : formatLocalTime(locale, i.at)}</span>
                      <Badge>{ev.kind.task}</Badge>
                      <Link href={`/groups/${groupId}/tasks/${i.id}`} className="font-semibold">{i.title}</Link>
                      {i.overdue && <Badge tone="danger">{t.tasks.overdue}</Badge>}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
