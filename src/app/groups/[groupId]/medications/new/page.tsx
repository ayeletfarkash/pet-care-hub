import { notFound } from "next/navigation";
import { listMembers } from "@/server/services/members";
import { todayLocal } from "@/server/schedule";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { PlanForm } from "@/components/forms/care-forms";
import { createPlanAction } from "@/app/actions/medications";
import { loadGroup } from "../../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.meds.createTitle };
}

export default async function NewPlanPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [{ user, role }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  if (role !== "admin") notFound();
  const members = await listMembers(user.id, groupId);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/medications`} label={t.meds.title} />
      <h1 className="mb-6 text-3xl font-bold">{t.meds.createTitle}</h1>
      <PlanForm t={t} action={createPlanAction} hidden={{ groupId }} members={members} submitLabel={t.common.save} today={todayLocal()} />
    </div>
  );
}
