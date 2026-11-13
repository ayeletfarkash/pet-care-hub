"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { createEvent, deleteEvent, setOccurrenceStatus, updateEvent } from "@/server/services/events";
import { eventSchema } from "@/server/validation";
import { getT } from "@/i18n/server";
import { handleAction, handleForm, type FormState } from "./form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createEventAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleForm(fd, eventSchema, async (input) => {
    const id = await createEvent(user.id, groupId, input);
    redirect(`/groups/${groupId}/events/${id}?notice=saved`);
  });
}

export async function updateEventAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), eventId = str(fd, "eventId");
  return handleForm(fd, eventSchema, async (input) => {
    await updateEvent(user.id, groupId, eventId, input);
    redirect(`/groups/${groupId}/events/${eventId}?notice=saved`);
  });
}

export async function deleteEventAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await deleteEvent(user.id, groupId, str(fd, "eventId"));
    redirect(`/groups/${groupId}/calendar?notice=deleted`);
  });
}

/** status: "completed" | "cancelled" | "" (clear). Both roles. */
export async function occurrenceStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  const s = str(fd, "status");
  return handleAction(async () => {
    await setOccurrenceStatus(user.id, groupId, str(fd, "eventId"), str(fd, "occurrence"), s === "completed" || s === "cancelled" ? s : null);
    revalidatePath("/", "layout");
    const { t } = await getT();
    return { ok: true, message: t.events.statusSaved };
  });
}
