import { notFound } from "next/navigation";
import { getPlan } from "@/server/services/medications";
import { listMembers } from "@/server/services/members";
import { todayLocal } from "@/server/schedule";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { PlanForm } from "@/components/forms/care-forms";
import { updatePlanAction } from "@/app/actions/medications";
import { loadGroup } from "../../../load";

export default async function EditPlanPage({ params }: { params: Promise<{ groupId: string; planId: string }> }) {
  const { groupId, planId } = await params;
  const [{ user }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  const [{ plan }, members] = await Promise.all([getPlan(user.id, groupId, planId).catch(() => notFound()), listMembers(user.id, groupId)]);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/medications/${planId}`} label={plan.name} />
      <h1 className="mb-6 text-3xl font-bold">{t.meds.editTitle}</h1>
      <PlanForm t={t} action={updatePlanAction} hidden={{ groupId, planId }} initial={{ ...plan, weekdays: plan.weekdays.map(String) }}
        members={members} submitLabel={t.common.save} today={todayLocal()} />
    </div>
  );
}
