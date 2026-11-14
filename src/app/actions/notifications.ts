"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { REMINDER_SOURCES, type ReminderSource } from "@/server/db/schema";
import { markRead, setNotificationPrefs, setReminderRule } from "@/server/services/notifications";
import { notificationPrefsSchema, reminderRuleSchema } from "@/server/validation";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n/server";
import { handleAction, handleForm, type FormState } from "./form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function notificationPrefsAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return handleForm(fd, notificationPrefsSchema, async ({ categories }) => {
    await setNotificationPrefs(user.id, categories);
    revalidatePath("/profile");
  });
}

export async function reminderRuleAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), sourceId = str(fd, "sourceId"), type = str(fd, "sourceType");
  return handleForm(fd, reminderRuleSchema, async (input) => {
    if (!(REMINDER_SOURCES as readonly string[]).includes(type)) throw new AppError("invalid_input");
    await setReminderRule(user.id, groupId, type as ReminderSource, sourceId, input);
    revalidatePath(`/groups/${groupId}`, "layout");
    const { t } = await getT();
    return { ok: true, message: t.notifications.ruleSaved };
  });
}

/** Without an id: mark all as read. */
export async function markReadAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id") || undefined;
  return handleAction(async () => {
    await markRead(user.id, id);
    revalidatePath("/", "layout"); // the header count
    const { t } = await getT();
    return { ok: true, message: id ? t.notifications.markedRead : t.notifications.allMarkedRead };
  });
}
