import Link from "next/link";
import { groupOccurrences, type Occurrence } from "@/server/services/events";
import { groupDoses, type Dose } from "@/server/services/medications";
import { groupTasksDue } from "@/server/services/tasks";
import { monthRange, shiftMonth, todayLocal } from "@/server/schedule";
import { fmt, formatDayHeading, formatLocalTime, formatMonth, type Dict } from "@/i18n";
import { getT } from "@/i18n/server";
import type { Locale } from "@/server/db/schema";
import { Notice } from "@/components/notice";
import { Badge, DoseItem, Empty, rowBodyClass, rowClass, SectionHeader } from "@/components/care";
import { FocusOnLoad } from "@/components/focus-on-load";
import { ActionForm } from "@/components/forms/action-form";
import { CompletionCheckbox, NoCheckbox } from "@/components/forms/completion-checkbox";
import { occurrenceStatusAction } from "@/app/actions/events";
import { taskStatusAction } from "@/app/actions/tasks";
import { loadGroup } from "../load";
import { MonthGrid, type GridItem } from "./month-grid";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.events.title };
}

type TaskDue = Awaited<ReturnType<typeof groupTasksDue>>[number];
type Item =
  | { kind: "event"; at: string; o: Occurrence }
  | { kind: "dose"; at: string; d: Dose }
  | { kind: "task"; at: string; task: TaskDue };

function gridItem(i: Item): GridItem {
  if (i.kind === "event") return { kind: i.kind, at: i.at, title: i.o.title, allDay: i.o.allDay, state: i.o.status === "completed" ? "done" : i.o.status === "cancelled" ? "cancelled" : undefined };
  if (i.kind === "dose") return { kind: i.kind, at: i.at, title: i.d.name, state: i.d.status === "given" ? "done" : i.d.status === "missed" ? "attention" : undefined };
  return { kind: i.kind, at: i.at, title: i.task.title, allDay: i.at.endsWith("23:59"), state: i.task.status === "completed" ? "done" : i.task.overdue ? "attention" : undefined };
}

function EventItem({ t, locale, o, groupId }: { t: Dict; locale: Locale; o: Occurrence; groupId: string }) {
  const ev = t.events;
  const date = formatDayHeading(locale, o.at.slice(0, 10));
  const fields = { groupId, eventId: o.eventId, occurrence: o.at };
  return (
    <li className={rowClass}>
      {o.status === "cancelled" ? <NoCheckbox /> : (
        <CompletionCheckbox action={occurrenceStatusAction} on={{ ...fields, status: "completed" }} off={{ ...fields, status: "" }}
          completed={o.status === "completed"} label={fmt(ev.completeLabel, { title: o.title, date })} />
      )}
      <div className={rowBodyClass}>
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
      {o.status === "scheduled" && (
        <ActionForm action={occurrenceStatusAction} fields={{ ...fields, status: "cancelled" }} label={ev.cancel}
          ariaLabel={fmt(ev.cancelLabel, { title: o.title, date })} pendingLabel={t.common.saving} variant="ghost" />
      )}
      {o.status === "cancelled" && (
        <ActionForm action={occurrenceStatusAction} fields={{ ...fields, status: "" }} label={ev.reopen}
          ariaLabel={fmt(ev.reopenLabel, { title: o.title, date })} pendingLabel={t.common.saving} variant="ghost" />
      )}
    </li>
  );
}

function TaskItem({ t, locale, x, at, groupId }: { t: Dict; locale: Locale; x: TaskDue; at: string; groupId: string }) {
  return (
    <li className={rowClass}>
      <CompletionCheckbox action={taskStatusAction} on={{ groupId, taskId: x.id, op: "complete" }} off={{ groupId, taskId: x.id, op: "reopen" }}
        completed={x.status === "completed"} label={fmt(t.tasks.completeLabel, { title: x.title })} />
      <div className={rowBodyClass}>
        <p className="font-bold">
          {!at.endsWith("23:59") && <><span className="ltr-value">{formatLocalTime(locale, at)}</span> · </>}
          <Link href={`/groups/${groupId}/tasks/${x.id}`}>{x.title}</Link>
        </p>
        <p className="mt-1 flex flex-wrap gap-2 text-sm">
          <Badge>{t.events.kind.task}</Badge>
          {x.status === "completed" && <Badge tone="success">{t.tasks.statuses.completed}</Badge>}
          {x.overdue && <Badge tone="danger">{t.tasks.overdue}</Badge>}
        </p>
      </div>
    </li>
  );
}

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ month?: string; day?: string; view?: string; notice?: string }> }) {
  const { groupId } = await params;
  const [{ user, pet }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const today = todayLocal();
  const gridView = sp.view === "calendar";
  const wanted = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") ? sp.day!.slice(0, 7) : (sp.month ?? "");
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(wanted) ? wanted : today.slice(0, 7);
  const { from, to } = monthRange(month);
  // A day picked in the calendar: the list opens at it, even when nothing is scheduled then.
  const day = !gridView && sp.day && sp.day.startsWith(`${month}-`) && sp.day >= from && sp.day <= to ? sp.day : undefined;
  const [occ, doses, tasks] = await Promise.all([
    groupOccurrences(user.id, groupId, from, to),
    groupDoses(user.id, groupId, from, to),
    groupTasksDue(user.id, groupId, from, to),
  ]);
  const items: Item[] = [
    ...occ.map((o) => ({ kind: "event" as const, at: o.at, o })),
    ...doses.map((d) => ({ kind: "dose" as const, at: d.scheduledFor, d })),
    ...tasks.map((x) => ({ kind: "task" as const, at: x.dueAt!, task: x })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const days = [...new Set([...items.map((i) => i.at.slice(0, 10)), ...(day ? [day] : [])])].sort();
  const view = gridView ? "view=calendar&" : "";
  const tab = "-mb-0.5 inline-flex min-h-11 items-center border-b-4 border-transparent px-3 font-semibold text-fg no-underline hover:border-line aria-[current=page]:border-primary";
  const ev = t.events;
  const nav = "inline-flex min-h-11 items-center rounded-lg border-2 border-line px-3 font-semibold no-underline hover:bg-accent hover:no-underline";

  return (
    <>
      <Notice t={t} notice={sp.notice} />
      <SectionHeader as="h1" id="cal-h" title={ev.title} action={{ href: `/groups/${groupId}/events/new`, label: ev.add }} />
      <p className="mb-4 text-muted">{fmt(ev.intro, { pet: pet.name })}</p>
      <nav aria-label={ev.viewNav} className="mb-4 border-b-2 border-divider">
        <ul className="flex gap-1">
          <li><Link className={tab} href={`?month=${month}`} aria-current={gridView ? undefined : "page"}>{ev.viewList}</Link></li>
          <li><Link className={tab} href={`?view=calendar&month=${month}`} aria-current={gridView ? "page" : undefined}>{ev.viewCalendar}</Link></li>
        </ul>
      </nav>
      <nav aria-label={ev.monthNav} className="mb-6 flex flex-wrap items-center gap-2">
        <Link className={nav} href={`?${view}month=${shiftMonth(month, -1)}`}><span aria-hidden="true" className="inline-block rtl:rotate-180">←</span>&nbsp;{ev.prev}</Link>
        <h2 id="month-h" className="mx-2 text-xl font-bold">{formatMonth(locale, month)}</h2>
        <Link className={nav} href={`?${view}month=${shiftMonth(month, 1)}`}>{ev.next}&nbsp;<span aria-hidden="true" className="inline-block rtl:rotate-180">→</span></Link>
        {month !== today.slice(0, 7) && <Link className={nav} href={gridView ? "?view=calendar" : "?"}>{ev.thisMonth}</Link>}
      </nav>
      {day && <FocusOnLoad id={`d-${day}`} />}
      {gridView ? <MonthGrid t={t} locale={locale} month={month} today={today} items={items.map(gridItem)} /> : days.length === 0 ? <Empty>{ev.empty}</Empty> : (
        <div className="space-y-6">
          {days.map((d) => (
            <div key={d}>
              <h3 id={`d-${d}`} tabIndex={d === day ? -1 : undefined} className={`mb-2 text-lg font-bold ${d === day ? "rounded-lg border-s-4 border-primary bg-accent px-3 py-1" : ""}`}>
                {formatDayHeading(locale, d)} {d === today && <Badge tone="info">{t.today.title}</Badge>}
              </h3>
              {!items.some((i) => i.at.startsWith(d)) && <Empty>{ev.emptyDay}</Empty>}
              <ul className="space-y-2">
                {items.filter((i) => i.at.startsWith(d)).map((i) =>
                  i.kind === "event" ? <EventItem key={`e${i.o.eventId}${i.at}`} t={t} locale={locale} o={i.o} groupId={groupId} />
                  : i.kind === "dose" ? <DoseItem key={`d${i.d.planId}${i.at}`} t={t} locale={locale} dose={i.d} />
                  : <TaskItem key={`t${i.task.id}`} t={t} locale={locale} x={i.task} at={i.at} groupId={groupId} />,
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
