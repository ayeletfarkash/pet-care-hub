import { todayLocal } from "@/server/schedule";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { MedicalForm } from "@/components/forms/care-forms";
import { createMedicalAction } from "@/app/actions/medical";
import { loadGroup } from "../../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.medical.createTitle };
}

export default async function NewMedicalPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/medical`} label={t.medical.title} />
      <h1 className="mb-6 text-3xl font-bold">{t.medical.createTitle}</h1>
      <MedicalForm t={t} action={createMedicalAction} hidden={{ groupId }} submitLabel={t.common.save} withFiles today={todayLocal()} />
    </div>
  );
}
