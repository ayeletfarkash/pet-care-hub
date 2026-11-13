"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { createPlan, deletePlan, endPlan, recordAdministration, removeAdministration, updatePlan } from "@/server/services/medications";
import { administrationSchema, medicationPlanSchema } from "@/server/validation";
import { getT } from "@/i18n/server";
import { handleAction, handleForm, type FormState } from "./form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createPlanAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleForm(fd, medicationPlanSchema, async (input) => {
    const id = await createPlan(user.id, groupId, input);
    redirect(`/groups/${groupId}/medications/${id}?notice=saved`);
  });
}

export async function updatePlanAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), planId = str(fd, "planId");
  return handleForm(fd, medicationPlanSchema, async (input) => {
    await updatePlan(user.id, groupId, planId, input);
    redirect(`/groups/${groupId}/medications/${planId}?notice=saved`);
  });
}

export async function endPlanAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), planId = str(fd, "planId");
  return handleAction(async () => {
    await endPlan(user.id, groupId, planId);
    redirect(`/groups/${groupId}/medications/${planId}?notice=saved`);
  });
}

export async function deletePlanAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await deletePlan(user.id, groupId, str(fd, "planId"));
    redirect(`/groups/${groupId}/medications?notice=deleted`);
  });
}

/** Both roles. Used from the medications page, the calendar and the dashboard. */
export async function markDoseAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleForm(fd, administrationSchema, async ({ planId, scheduledFor, notes }) => {
    await recordAdministration(user.id, groupId, planId, scheduledFor, notes);
    revalidatePath("/", "layout");
    const { t } = await getT();
    return { ok: true, message: t.meds.doseSaved };
  });
}

export async function removeDoseAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await removeAdministration(user.id, groupId, str(fd, "administrationId"));
    revalidatePath("/", "layout");
    const { t } = await getT();
    return { ok: true, message: t.meds.removed };
  });
}
