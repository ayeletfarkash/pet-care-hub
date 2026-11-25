import Link from "next/link";
import type { Locale } from "@/server/db/schema";
import { dosesForGroups } from "@/server/services/medications";
import { occurrencesForGroups } from "@/server/services/events";
import { openTasksForGroups } from "@/server/services/tasks";
import { activitiesForGroups } from "@/server/services/routines";
import { itemsNeedingReorder } from "@/server/services/inventory";
import { addDays, todayLocal } from "@/server/schedule";
import { formatDate, formatLocalDateTime, type Dict } from "@/i18n";
import { dueText } from "@/app/groups/[groupId]/tasks/due";
import { ActivityItem, Badge, DoseItem, qtyText, StockBadge } from "./care";

type G = { groupId: string; petName: string };

/**
 * Basic reminders (PRD Phase 2, §15.3), computed on each visit: the user's doses today, their open
 * tasks and the coming week. `groups` are the user's own groups.
 */
export async function Today({ t, locale, userId, groups }: { t: Dict; locale: Locale; userId: string; groups: G[] }) {
  const ids = groups.map((g) => g.groupId);
  const today = todayLocal();
  const [doses, myTasks, upcoming, activities, lowStock] = await Promise.all([
    dosesForGroups(ids, today, today, { responsibleUserId: userId }),
    openTasksForGroups(ids, { assignedTo: userId }),
    occurrencesForGroups(ids, today, addDays(today, 7)),
    activitiesForGroups(ids, today, today, { responsibleUserId: userId }),
    itemsNeedingReorder(ids),
  ]);
  const pet = (gid: string) => groups.find((g) => g.groupId === gid)?.petName ?? "";
  const s = t.today;
  const box = "card rounded-xl border-2 border-divider bg-surface p-4";

  return (
    <section aria-labelledby="today-h" className="mt-8">
      <h2 id="today-h" className="mb-3 text-2xl font-bold">{s.title}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="mydoses-h" className={box}>
          <h3 id="mydoses-h" className="mb-2 text-lg font-bold">{s.myDoses}</h3>
          {doses.length === 0 ? <p className="text-muted">{s.noMyDoses}</p> : (
            <ul className="space-y-2">{doses.map((d) => <DoseItem key={d.planId + d.scheduledFor} t={t} locale={locale} dose={d} petName={pet(d.groupId)} />)}</ul>
          )}
        </section>
        <section aria-labelledby="mytasks-h" className={box}>
          <h3 id="mytasks-h" className="mb-2 text-lg font-bold">{s.myTasks}</h3>
          {myTasks.length === 0 ? <p className="text-muted">{s.noMyTasks}</p> : (
            <ul className="space-y-2">
              {myTasks.slice(0, 10).map((x) => (
                <li key={x.id}>
                  <Link href={`/groups/${x.groupId}/tasks/${x.id}`} className="font-semibold">{x.title}</Link>
                  <span className="text-sm text-muted"> · {pet(x.groupId)} · {dueText(t, locale, x.dueAt)}</span>
                  {x.overdue && <> <Badge tone="danger">{t.tasks.overdue}</Badge></>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="myroutines-h" className={box}>
          <h3 id="myroutines-h" className="mb-2 text-lg font-bold">{s.myRoutines}</h3>
          {activities.length === 0 ? <p className="text-muted">{s.noMyRoutines}</p> : (
            <ul className="space-y-2">{activities.map((a) => <ActivityItem key={a.routineId + a.scheduledFor} t={t} locale={locale} a={a} petName={pet(a.groupId)} />)}</ul>
          )}
        </section>
        {lowStock.length > 0 && (
          <section aria-labelledby="reorder-h" className={box}>
            <h3 id="reorder-h" className="mb-2 text-lg font-bold">{s.reorder}</h3>
            <ul className="space-y-2">
              {lowStock.slice(0, 10).map((i) => (
                <li key={i.id}>
                  <Link href={`/groups/${i.groupId}/inventory/${i.id}`} className="font-semibold">{i.name}</Link>
                  <span className="text-sm text-muted"> · {pet(i.groupId)} · <span className="ltr-value">{qtyText(locale, i.quantity, i.unit)}</span></span>{" "}
                  <StockBadge t={t} item={i} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="upcoming-h" className={`${box} lg:col-span-2`}>
          <h3 id="upcoming-h" className="mb-2 text-lg font-bold">{s.upcoming}</h3>
          {upcoming.filter((o) => o.status === "scheduled").length === 0 ? <p className="text-muted">{s.noUpcoming}</p> : (
            <ul className="space-y-1">
              {upcoming.filter((o) => o.status === "scheduled").slice(0, 12).map((o) => (
                <li key={o.eventId + o.at}>
                  <span className="ltr-value">{o.allDay ? formatDate(locale, o.at.slice(0, 10)) : formatLocalDateTime(locale, o.at)}</span>
                  {" · "}<Link href={`/groups/${o.groupId}/events/${o.eventId}`} className="font-semibold">{o.title}</Link>
                  <span className="text-sm text-muted"> · {pet(o.groupId)} · {t.events.types[o.type]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

/** Per-group task counts for the pet cards. */
export async function groupTaskStats(groupIds: string[]) {
  const open = await openTasksForGroups(groupIds);
  const stats = new Map<string, { open: number; overdue: number }>();
  for (const x of open) {
    const s = stats.get(x.groupId) ?? { open: 0, overdue: 0 };
    s.open++;
    if (x.overdue) s.overdue++;
    stats.set(x.groupId, s);
  }
  return stats;
}
