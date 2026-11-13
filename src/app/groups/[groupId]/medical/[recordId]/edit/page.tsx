import { notFound } from "next/navigation";
import { getMedicalRecord } from "@/server/services/medical";
import { todayLocal } from "@/server/schedule";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { MedicalForm } from "@/components/forms/care-forms";
import { updateMedicalAction } from "@/app/actions/medical";
import { loadGroup } from "../../../load";

export default async function EditMedicalPage({ params }: { params: Promise<{ groupId: string; recordId: string }> }) {
  const { groupId, recordId } = await params;
  const [{ user, role }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  if (role !== "admin") notFound(); // the action enforces this too
  const { record } = await getMedicalRecord(user.id, groupId, recordId).catch(() => notFound());
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/medical/${recordId}`} label={record.title} />
      <h1 className="mb-6 text-3xl font-bold">{t.medical.editTitle}</h1>
      <MedicalForm t={t} action={updateMedicalAction} hidden={{ groupId, recordId }} initial={record} submitLabel={t.common.save} today={todayLocal()} />
    </div>
  );
}
