import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "./auth/session";
import { getA11yPrefs, sanitizeA11y, type A11yPrefs } from "./services/users";

export const A11Y_COOKIE = "pch_a11y";

/** Prefs for this request: the user's saved prefs, else this device's cookie. */
export async function getRequestA11y(): Promise<{ prefs: A11yPrefs; perAccount: boolean }> {
  const user = await getCurrentUser();
  if (user) return { prefs: await getA11yPrefs(user.id), perAccount: true };
  const raw = (await cookies()).get(A11Y_COOKIE)?.value;
  let parsed: unknown = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* ignore malformed cookie */ }
  return { prefs: sanitizeA11y(parsed), perAccount: false };
}
