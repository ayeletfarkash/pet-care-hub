import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentUser } from "@/server/auth/session";
import type { Locale } from "@/server/db/schema";
import { dictionaries, LOCALE_COOKIE } from ".";

/** Logged-in users: their saved language. Visitors: cookie. Default: Hebrew (PRD §16.1). */
export const getLocale = cache(async (): Promise<Locale> => {
  const user = await getCurrentUser();
  if (user) return user.locale;
  return (await cookies()).get(LOCALE_COOKIE)?.value === "en" ? "en" : "he";
});

export async function getT() {
  const locale = await getLocale();
  return { t: dictionaries[locale], locale };
}
