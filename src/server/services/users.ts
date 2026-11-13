import { and, eq, isNull, lt } from "drizzle-orm";
import { db, writeTx } from "../db";
import { accessibilityPreferences, sessions, users, type Locale } from "../db/schema";
import { AppError, isUniqueViolation } from "../errors";
import { getDummyHash, hashPassword, verifyPassword } from "../auth/password";
import { rateLimit } from "../rate-limit";

export type A11yPrefs = {
  textScale: number;
  contrast: "default" | "high";
  underlineLinks: boolean;
  highlightFocus: boolean;
  reduceMotion: boolean;
};
export const DEFAULT_A11Y: A11yPrefs = {
  textScale: 100, contrast: "default", underlineLinks: false, highlightFocus: false, reduceMotion: false,
};
export const TEXT_SCALES = [100, 112, 125, 150, 175, 200] as const;

export async function registerUser(input: { name: string; email: string; password: string; locale: Locale }) {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get();
  if (existing) throw new AppError("email_taken");
  const passwordHash = await hashPassword(input.password);
  try {
    const [user] = await writeTx((tx) =>
      tx.insert(users)
        .values({ name: input.name, email: input.email, passwordHash, locale: input.locale })
        .returning({ id: users.id }),
    );
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("email_taken"); // concurrent registration
    throw e;
  }
}

export async function authenticate(email: string, password: string, clientKey: string) {
  // Per email+client (not per email alone, so strangers can't lock a victim out), plus per client.
  rateLimit(`login:${email}:${clientKey}`, 10, 15 * 60_000);
  rateLimit(`login-ip:${clientKey}`, 30, 15 * 60_000);
  const user = await db.select().from(users).where(and(eq(users.email, email), isNull(users.deletedAt))).get();
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.passwordHash || !ok) throw new AppError("invalid_credentials");
  // Lazy cleanup of this user's expired sessions.
  await writeTx((tx) =>
    tx.delete(sessions).where(and(eq(sessions.userId, user.id), lt(sessions.expiresAt, new Date()))),
  );
  return { id: user.id };
}

export async function updateProfile(userId: string, input: { name: string; locale: Locale }) {
  await writeTx((tx) => tx.update(users).set(input).where(eq(users.id, userId)));
}

export async function getA11yPrefs(userId: string): Promise<A11yPrefs> {
  const row = await db.select().from(accessibilityPreferences).where(eq(accessibilityPreferences.userId, userId)).get();
  if (!row) return DEFAULT_A11Y;
  const { userId: _u, ...prefs } = row;
  return prefs;
}

export async function saveA11yPrefs(userId: string, prefs: A11yPrefs) {
  await writeTx((tx) =>
    tx.insert(accessibilityPreferences)
      .values({ userId, ...prefs })
      .onConflictDoUpdate({ target: accessibilityPreferences.userId, set: prefs }),
  );
}

/** Coerce untrusted input (cookie / client) into valid prefs. */
export function sanitizeA11y(raw: unknown): A11yPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    textScale: TEXT_SCALES.includes(r.textScale as never) ? (r.textScale as number) : 100,
    contrast: r.contrast === "high" ? "high" : "default",
    underlineLinks: r.underlineLinks === true,
    highlightFocus: r.highlightFocus === true,
    reduceMotion: r.reduceMotion === true,
  };
}
