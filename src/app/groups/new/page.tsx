import { requireUser } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { PetForm } from "@/components/forms/pet-form";
import { createGroupAction } from "@/app/actions/groups";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.pet.createTitle };
}

export default async function NewGroupPage() {
  await requireUser();
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold">{t.pet.createTitle}</h1>
      <p className="mb-6 mt-1 text-muted">{t.pet.createIntro}</p>
      <PetForm t={t} action={createGroupAction} submitLabel={t.pet.create} />
    </div>
  );
}
