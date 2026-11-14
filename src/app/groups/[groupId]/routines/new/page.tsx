import { notFound } from "next/navigation";
import { listMembers } from "@/server/services/members";
import { todayLocal } from "@/server/schedule";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { RoutineForm } from "@/components/forms/care-forms";
import { createRoutineAction } from "@/app/actions/routines";
import { loadGroup } from "../../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.routines.createTitle };
}

export default async function NewRoutinePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [{ user, role }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  if (role !== "admin") notFound();
  const members = await listMembers(user.id, groupId);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/routines`} label={t.routines.title} />
      <h1 className="mb-6 text-3xl font-bold">{t.routines.createTitle}</h1>
      <RoutineForm t={t} action={createRoutineAction} hidden={{ groupId }} members={members} submitLabel={t.common.save} today={todayLocal()} />
    </div>
  );
}
