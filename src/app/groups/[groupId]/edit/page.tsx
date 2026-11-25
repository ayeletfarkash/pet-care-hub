import { BackLink } from "@/components/back-link";
import { fmt } from "@/i18n";
import { getT } from "@/i18n/server";
import { PetForm } from "@/components/forms/pet-form";
import { PhotoForm } from "@/components/forms/photo-form";
import { updatePetAction } from "@/app/actions/groups";
import { loadGroup } from "../load";

export async function generateMetadata({ params }: { params: Promise<{ groupId: string }> }) {
  const [{ pet }, { t }] = await Promise.all([loadGroup((await params).groupId), getT()]);
  return { title: fmt(t.pet.editTitle, { pet: pet.name }) };
}

export default async function EditPetPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [{ pet }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  const { id: _id, groupId: _g, photoFile, createdAt: _c, updatedAt, ...values } = pet;

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}`} label={pet.name} />
      <h1 className="mb-6 text-3xl font-bold">{fmt(t.pet.editTitle, { pet: pet.name })}</h1>
      <PhotoForm t={t} groupId={groupId} hasPhoto={!!photoFile} petName={pet.name} species={pet.species} version={updatedAt?.getTime() ?? 0} />
      <PetForm t={t} action={updatePetAction} groupId={groupId} initial={values} submitLabel={t.common.save} />
    </div>
  );
}
