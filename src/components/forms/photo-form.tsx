"use client";

import { useActionState } from "react";
import { removePhotoAction, uploadPhotoAction } from "@/app/actions/groups";
import type { FormState } from "@/app/actions/form";
import { fmt, type Dict } from "@/i18n";
import { SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";
import { ActionForm } from "./action-form";

export function PhotoForm({ t, groupId, hasPhoto, petName, version }: { t: Dict; groupId: string; hasPhoto: boolean; petName: string; version: number }) {
  const [state, action] = useActionState(uploadPhotoAction, {} as FormState);
  return (
    <section aria-labelledby="photo-h" className="card mb-6 rounded-xl border-2 border-divider bg-surface p-5">
      <h2 id="photo-h" className="mb-3 text-xl font-bold">{t.pet.photo}</h2>
      {hasPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- auth-protected route
        <img src={`/groups/${groupId}/photo?v=${version}`} alt={fmt(t.pet.photoAlt, { pet: petName })} className="mb-3 size-28 rounded-full object-cover" />
      )}
      <form action={action}>
        <FormStatus state={state} />
        <input type="hidden" name="groupId" value={groupId} />
        <label htmlFor="photo" className="block font-semibold">{t.pet.uploadPhoto}</label>
        <p id="photo-hint" className="text-sm text-muted">{t.pet.photoHint}</p>
        <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-hint"
          className="my-2 block w-full rounded-lg border-2 border-line p-2 file:me-3 file:min-h-10 file:rounded-md file:border-0 file:bg-accent file:px-3 file:font-semibold" />
        <SubmitButton variant="secondary" pendingLabel={t.common.saving}>{t.pet.uploadPhoto}</SubmitButton>
      </form>
      {hasPhoto && (
        <ActionForm action={removePhotoAction} fields={{ groupId }} label={t.pet.removePhoto} pendingLabel={t.common.saving} variant="ghost" className="mt-2" />
      )}
    </section>
  );
}
