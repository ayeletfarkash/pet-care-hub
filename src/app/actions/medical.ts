"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { addAttachments, createMedicalRecord, deleteAttachment, deleteMedicalRecord, updateMedicalRecord } from "@/server/services/medical";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { medicalRecordSchema } from "@/server/validation";
import { getT } from "@/i18n/server";
import { handleAction, handleForm, type FormState } from "./form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const MAX_FILES = 10;

async function uploadsFrom(fd: FormData, userId: string) {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) throw new AppError("invalid_file");
  // shortcut: per-user upload rate limit only; add a per-group storage quota before public launch.
  for (let i = 0; i < files.length; i++) rateLimit(`upload:${userId}`, 100, 60 * 60_000);
  return Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
}

export async function createMedicalAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleForm(fd, medicalRecordSchema, async (input) => {
    const id = await createMedicalRecord(user.id, groupId, input, await uploadsFrom(fd, user.id));
    redirect(`/groups/${groupId}/medical/${id}?notice=saved`);
  });
}

export async function updateMedicalAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), recordId = str(fd, "recordId");
  return handleForm(fd, medicalRecordSchema, async (input) => {
    await updateMedicalRecord(user.id, groupId, recordId, input);
    redirect(`/groups/${groupId}/medical/${recordId}?notice=saved`);
  });
}

export async function addDocumentsAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), recordId = str(fd, "recordId");
  return handleAction(async () => {
    const uploads = await uploadsFrom(fd, user.id);
    if (uploads.length === 0) throw new AppError("invalid_file");
    await addAttachments(user.id, groupId, recordId, uploads);
    revalidatePath(`/groups/${groupId}/medical`, "layout");
    const { t } = await getT();
    return { ok: true, message: t.medical.uploaded };
  });
}

export async function deleteDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await deleteAttachment(user.id, groupId, str(fd, "attachmentId"));
    revalidatePath(`/groups/${groupId}/medical`, "layout");
  });
}

export async function deleteMedicalAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await deleteMedicalRecord(user.id, groupId, str(fd, "recordId"));
    redirect(`/groups/${groupId}/medical?notice=deleted`);
  });
}
