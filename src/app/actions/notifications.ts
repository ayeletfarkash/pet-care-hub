"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { REMINDER_SOURCES, type ReminderSource } from "@/server/db/schema";
import { markRead, setNotificationPrefs, setReminderRule, snoozeNotification } from "@/server/services/notifications";
import { removeSubscription, saveSubscription } from "@/server/services/push";
import { notificationPrefsSchema, pushSubscriptionSchema, reminderRuleSchema, snoozeSchema } from "@/server/validation";
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

export async function snoozeAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return handleForm(fd, snoozeSchema, async ({ until }) => {
    await snoozeNotification(user.id, id, until);
    revalidatePath("/", "layout");
    const { t } = await getT();
    return { ok: true, message: t.notifications.snoozed };
  });
}

/** Called from the browser with PushSubscription.toJSON(). */
export async function pushSubscribeAction(raw: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const sub = pushSubscriptionSchema.safeParse(raw);
  if (!sub.success) return { ok: false };
  await saveSubscription(user.id, sub.data);
  return { ok: true };
}

export async function pushUnsubscribeAction(endpoint: unknown): Promise<void> {
  const user = await requireUser();
  if (typeof endpoint === "string" && endpoint.length <= 1000) await removeSubscription(user.id, endpoint);
}
