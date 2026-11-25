import { notFound } from "next/navigation";
import { getEvent } from "@/server/services/events";
import { listMembers } from "@/server/services/members";
import { todayLocal } from "@/server/schedule";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { EventForm } from "@/components/forms/care-forms";
import { updateEventAction } from "@/app/actions/events";
import { loadGroup } from "../../../load";

export default async function EditEventPage({ params }: { params: Promise<{ groupId: string; eventId: string }> }) {
  const { groupId, eventId } = await params;
  const [{ user }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  const [{ event: e }, members] = await Promise.all([getEvent(user.id, groupId, eventId).catch(() => notFound()), listMembers(user.id, groupId)]);
  const initial = { ...e, date: e.startsAt.slice(0, 10), time: e.allDay ? "" : e.startsAt.slice(11) };
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/events/${eventId}`} label={e.title} />
      <h1 className="mb-6 text-3xl font-bold">{t.events.editTitle}</h1>
      <EventForm t={t} action={updateEventAction} hidden={{ groupId, eventId }} initial={initial} members={members} submitLabel={t.common.save} today={todayLocal()} />
    </div>
  );
}
