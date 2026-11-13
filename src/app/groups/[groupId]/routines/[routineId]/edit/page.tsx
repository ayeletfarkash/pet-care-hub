import { notFound } from "next/navigation";
import { getRoutine } from "@/server/services/routines";
import { listMembers } from "@/server/services/members";
import { todayLocal } from "@/server/schedule";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { RoutineForm } from "@/components/forms/care-forms";
import { updateRoutineAction } from "@/app/actions/routines";
import { loadGroup } from "../../../load";

export default async function EditRoutinePage({ params }: { params: Promise<{ groupId: string; routineId: string }> }) {
  const { groupId, routineId } = await params;
  const [{ user, role }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  if (role !== "admin") notFound();
  const [{ routine }, members] = await Promise.all([getRoutine(user.id, groupId, routineId).catch(() => notFound()), listMembers(user.id, groupId)]);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/routines/${routineId}`} label={routine.name} />
      <h1 className="mb-6 text-3xl font-bold">{t.routines.editTitle}</h1>
      <RoutineForm t={t} action={updateRoutineAction} hidden={{ groupId, routineId }} initial={{ ...routine, weekdays: routine.weekdays.map(String) }}
        members={members} submitLabel={t.common.save} today={todayLocal()} />
    </div>
  );
}
