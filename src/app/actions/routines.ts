"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { createRoutine, deleteRoutine, endRoutine, logActivity, removeLog, updateRoutine } from "@/server/services/routines";
import { routineLogSchema, routineSchema } from "@/server/validation";
import { getT } from "@/i18n/server";
import { handleAction, handleForm, type FormState } from "./form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createRoutineAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleForm(fd, routineSchema, async (input) => {
    const id = await createRoutine(user.id, groupId, input);
    redirect(`/groups/${groupId}/routines/${id}?notice=saved`);
  });
}

export async function updateRoutineAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), routineId = str(fd, "routineId");
  return handleForm(fd, routineSchema, async (input) => {
    await updateRoutine(user.id, groupId, routineId, input);
    redirect(`/groups/${groupId}/routines/${routineId}?notice=saved`);
  });
}

export async function endRoutineAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), routineId = str(fd, "routineId");
  return handleAction(async () => {
    await endRoutine(user.id, groupId, routineId);
    redirect(`/groups/${groupId}/routines/${routineId}?notice=saved`);
  });
}

export async function deleteRoutineAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await deleteRoutine(user.id, groupId, str(fd, "routineId"));
    redirect(`/groups/${groupId}/routines?notice=deleted`);
  });
}

/** Both roles: completed / missed for a scheduled activity, or an extra activity. */
export async function logActivityAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleForm(fd, routineLogSchema, async (input) => {
    await logActivity(user.id, groupId, input);
    revalidatePath("/", "layout");
    const { t } = await getT();
    return { ok: true, message: input.status === "missed" ? t.routines.missedSaved : t.routines.logSaved };
  });
}

export async function removeLogAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await removeLog(user.id, groupId, str(fd, "logId"));
    revalidatePath("/", "layout");
    const { t } = await getT();
    return { ok: true, message: t.routines.logRemoved };
  });
}
