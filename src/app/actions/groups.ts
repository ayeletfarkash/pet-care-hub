"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { createGroupWithPet, deleteGroup, restoreGroup } from "@/server/services/groups";
import { getPetForMember, removePetPhoto, setPetPhoto, updatePet } from "@/server/services/pets";
import { leaveGroup } from "@/server/services/members";
import { AppError } from "@/server/errors";
import { petSchema } from "@/server/validation";
import { getT } from "@/i18n/server";
import { handleAction, handleForm, type FormState } from "./form";

const gid = (fd: FormData) => String(fd.get("groupId") ?? "");

export async function createGroupAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return handleForm(fd, petSchema, async (pet) => {
    const groupId = await createGroupWithPet(user.id, pet);
    redirect(`/groups/${groupId}`);
  });
}

export async function updatePetAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = gid(fd);
  return handleForm(fd, petSchema, async (pet) => {
    await updatePet(user.id, groupId, pet);
    redirect(`/groups/${groupId}?notice=saved`);
  });
}

export async function uploadPhotoAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = gid(fd);
  const file = fd.get("photo");
  return handleAction(async () => {
    if (!(file instanceof File)) throw new AppError("invalid_photo");
    await setPetPhoto(user.id, groupId, new Uint8Array(await file.arrayBuffer()));
    revalidatePath(`/groups/${groupId}`, "layout");
    const { t } = await getT();
    return { ok: true, message: t.pet.photoSaved };
  });
}

export async function removePhotoAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = gid(fd);
  return handleAction(async () => {
    await removePetPhoto(user.id, groupId);
    revalidatePath(`/groups/${groupId}`, "layout");
    const { t } = await getT();
    return { ok: true, message: t.pet.photoSaved };
  });
}

export async function deleteGroupAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = gid(fd);
  return handleForm(fd, z.object({ confirmName: z.string() }), async ({ confirmName }) => {
    const { pet } = await getPetForMember(user.id, groupId);
    if (confirmName.trim() !== pet.name) {
      const { t } = await getT();
      return { error: t.errors.confirm_name, fieldErrors: { confirmName: t.errors.confirm_name } };
    }
    await deleteGroup(user.id, groupId);
    redirect("/?notice=group_deleted");
  });
}

export async function restoreGroupAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = gid(fd);
  return handleAction(async () => {
    await restoreGroup(user.id, groupId);
    redirect("/?notice=group_restored");
  });
}

export async function leaveGroupAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = gid(fd);
  return handleAction(async () => {
    await leaveGroup(user.id, groupId);
    redirect("/?notice=left");
  });
}
