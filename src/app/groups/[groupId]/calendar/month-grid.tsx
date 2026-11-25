import Link from "next/link";
import { addDays, monthWeeks } from "@/server/schedule";
import { fmt, formatDayHeading, formatLocalTime, formatWeekday, type Dict } from "@/i18n";
import type { Locale } from "@/server/db/schema";

export type GridItem = { kind: "event" | "dose" | "task"; at: string; title: string; allDay?: boolean; state?: "done" | "cancelled" | "attention" };

const KINDS = ["event", "task", "dose"] as const; // one-off items first, so daily doses can't push them out of sight
const MARKS = { event: "📅", task: "📝", dose: "💊" } as const;
const MAX_CHIPS = 3;

/** Month overview (read-only). Each day is one link to that day in the list view, where items are acted on. */
export function MonthGrid({ t, locale, month, today, items }: { t: Dict; locale: Locale; month: string; today: string; items: GridItem[] }) {
  const ev = t.events;
  const stateText = { done: ev.statusLabel.completed, cancelled: ev.statusLabel.cancelled, attention: ev.attention };

  const cell = (day: string) => {
    const all = items.filter((i) => i.at.startsWith(day)).sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.at.localeCompare(b.at));
    const shown = all.slice(0, MAX_CHIPS);
    return (
      <td key={day} className={`relative h-18 border border-divider p-1 align-top hover:bg-accent has-[a:focus-visible]:outline-3 has-[a:focus-visible]:-outline-offset-3 has-[a:focus-visible]:outline-[var(--focus)] sm:h-32 ${day === today ? "bg-accent" : ""}`}>
        <Link href={`?day=${day}`} aria-label={fmt(ev.dayItems, { date: formatDayHeading(locale, day), count: all.length })} aria-current={day === today ? "date" : undefined}
          className="inline-flex size-7 items-center justify-center rounded-full font-semibold text-fg no-underline after:absolute after:inset-0 hover:no-underline focus-visible:outline-none aria-[current=date]:bg-primary aria-[current=date]:text-on-primary">
          {Number(day.slice(8))}
        </Link>
        <p aria-hidden="true" className="flex flex-wrap text-xs leading-tight sm:hidden">
          {KINDS.filter((k) => all.some((i) => i.kind === k)).map((k) => <span key={k}>{MARKS[k]}</span>)}
        </p>
        {all.length > 0 && (
          <ul className="sr-only sm:not-sr-only sm:space-y-1">
            {shown.map((i, n) => (
              <li key={n} className={`truncate rounded-md border px-1 text-xs leading-5 cal-${i.kind} ${i.state === "attention" ? "border-danger" : "border-transparent"}`}>
                <span aria-hidden="true">{MARKS[i.kind]} </span><span className="sr-only">{ev.kind[i.kind]}: </span>
                {i.state && (
                  <>
                    <span aria-hidden="true">{{ done: "✓ ", attention: "! ", cancelled: "" }[i.state]}</span>
                    <span className="sr-only">{stateText[i.state]}, </span>
                  </>
                )}
                <span className={i.state === "cancelled" ? "line-through" : undefined}>
                  {!i.allDay && <><span className="ltr-value">{formatLocalTime(locale, i.at)}</span> </>}{i.title}
                </span>
              </li>
            ))}
            {all.length > MAX_CHIPS && <li className="px-1 text-xs font-semibold">{fmt(ev.more, { count: all.length - MAX_CHIPS })}</li>}
          </ul>
        )}
      </td>
    );
  };

  return (
    <>
      <p id="grid-hint" className="mb-2 text-muted">{ev.gridHint}</p>
      <ul className="mb-3 flex flex-wrap gap-2 text-sm">
        {KINDS.map((k) => <li key={k} className={`rounded-full border border-transparent px-3 py-0.5 font-semibold cal-${k}`}><span aria-hidden="true">{MARKS[k]} </span>{ev.kind[k]}</li>)}
      </ul>
      <div className="card overflow-hidden rounded-2xl border-2 border-divider bg-surface">
        <table aria-labelledby="month-h" aria-describedby="grid-hint" className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              {Array.from({ length: 7 }, (_, i) => addDays("2024-01-07", i)).map((d) => ( // any week that starts on Sunday
                <th key={d} scope="col" className="border-b-2 border-divider px-0.5 py-2 text-sm font-semibold text-muted">
                  <span aria-hidden="true" className="sm:hidden">{formatWeekday(locale, d, "narrow")}</span>
                  <span className="sr-only sm:not-sr-only">{formatWeekday(locale, d, "long")}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthWeeks(month).map((week, w) => (
              <tr key={w}>{week.map((day, i) => (day ? cell(day) : <td key={i} className="border border-divider bg-bg" />))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
