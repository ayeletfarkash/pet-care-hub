"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { saveA11yPrefs, sanitizeA11y, updateProfile } from "@/server/services/users";
import { profileSchema } from "@/server/validation";
import { LOCALE_COOKIE } from "@/i18n";
import { A11Y_COOKIE } from "@/server/a11y-cookie";
import { handleForm, type FormState } from "./form";

const YEAR = 365 * 24 * 60 * 60;

export async function switchLocaleAction(fd: FormData) {
  const locale = fd.get("locale") === "en" ? "en" : "he";
  const user = await getCurrentUser();
  if (user) await updateProfile(user.id, { name: user.name, locale });
  else (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax", httpOnly: true });
  revalidatePath("/", "layout");
}

/** Accessibility prefs: saved per user account; visitors keep them in a cookie on this device. */
export async function saveA11yAction(raw: unknown) {
  const prefs = sanitizeA11y(raw);
  const user = await getCurrentUser();
  if (user) await saveA11yPrefs(user.id, prefs);
  else (await cookies()).set(A11Y_COOKIE, JSON.stringify(prefs), { path: "/", maxAge: YEAR, sameSite: "lax", httpOnly: true });
}

export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return handleForm(fd, profileSchema, async (input) => {
    await updateProfile(user.id, input);
    revalidatePath("/", "layout");
  });
}
