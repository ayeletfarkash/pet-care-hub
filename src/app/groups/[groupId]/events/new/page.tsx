import { listMembers } from "@/server/services/members";
import { todayLocal } from "@/server/schedule";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { EventForm } from "@/components/forms/care-forms";
import { createEventAction } from "@/app/actions/events";
import { loadGroup } from "../../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.events.createTitle };
}

export default async function NewEventPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [{ user }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  const members = await listMembers(user.id, groupId);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/calendar`} label={t.events.title} />
      <h1 className="mb-6 text-3xl font-bold">{t.events.createTitle}</h1>
      <EventForm t={t} action={createEventAction} hidden={{ groupId }} members={members} submitLabel={t.common.save} today={todayLocal()} />
    </div>
  );
}
