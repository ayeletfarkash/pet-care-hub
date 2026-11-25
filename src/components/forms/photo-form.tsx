"use client";

import { useActionState } from "react";
import { removePhotoAction, uploadPhotoAction } from "@/app/actions/groups";
import type { FormState } from "@/app/actions/form";
import { fmt, type Dict } from "@/i18n";
import type { Species } from "@/server/db/schema";
import { SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";
import { PencilIcon, TrashIcon, iconButtonClass } from "../ui/icons";
import { SpeciesIcon } from "../species-icon";

/** Choosing a file saves it at once; pencil = choose/replace, trash = remove. */
export function PhotoForm({ t, groupId, hasPhoto, petName, species, version }: {
  t: Dict; groupId: string; hasPhoto: boolean; petName: string; species: Species; version: number;
}) {
  // One state for both forms, so the status always reflects the latest action.
  const [state, act] = useActionState(async (s: FormState, fd: FormData) => {
    if (fd.get("op") !== "remove") return uploadPhotoAction(s, fd);
    const res = await removePhotoAction(s, fd);
    if (res.ok) setTimeout(() => document.getElementById("photo")?.focus(), 150); // the trash button is gone
    return res;
  }, {} as FormState);
  const p = t.pet;
  return (
    <section aria-labelledby="photo-h" className="card mb-6 rounded-xl border-2 border-divider bg-surface p-5">
      <h2 id="photo-h" className="mb-3 text-xl font-bold">{p.photo}</h2>
      <FormStatus state={state} />
      <div className="flex flex-wrap items-center gap-4">
        {hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- auth-protected route
          <img src={`/groups/${groupId}/photo?v=${version}`} alt={fmt(p.photoAlt, { pet: petName })} className="size-28 rounded-full object-cover" />
        ) : (
          <SpeciesIcon species={species} size="lg" />
        )}
        <form action={act}>
          <input type="hidden" name="groupId" value={groupId} />
          <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-hint"
            className="peer sr-only" onChange={(e) => e.currentTarget.files?.length && e.currentTarget.form?.requestSubmit()} />
          <label htmlFor="photo" title={hasPhoto ? p.changePhoto : p.uploadPhoto}
            className={`${iconButtonClass} cursor-pointer peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]`}>
            <PencilIcon /><span className="sr-only">{hasPhoto ? p.changePhoto : p.uploadPhoto}</span>
          </label>
        </form>
        {hasPhoto && (
          <form action={act}>
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="op" value="remove" />
            <SubmitButton variant="danger" pendingLabel={t.common.saving} aria-label={p.removePhoto} title={p.removePhoto} className="min-w-11 px-2!">
              <TrashIcon />
            </SubmitButton>
          </form>
        )}
      </div>
      <p id="photo-hint" className="mt-2 text-sm text-muted">{p.photoHint}</p>
    </section>
  );
}
