import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db, writeTx, type Tx } from "../db";
import { accessibilityPreferences, passwordResetTokens, pushSubscriptions, sessions, users, type Locale } from "../db/schema";
import { AppError, isUniqueViolation } from "../errors";
import { getDummyHash, hashPassword, verifyPassword } from "../auth/password";
import type { GoogleIdentity } from "../auth/google";
import { rateLimit } from "../rate-limit";
import { hashToken, newToken } from "../tokens";

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

const RESET_TOKEN_MS = 60 * 60_000;

/** Null when no account has this email. Limits apply whether or not it exists, so they reveal nothing. */
export async function createPasswordReset(email: string, clientKey: string) {
  rateLimit(`reset-ip:${clientKey}`, 20, 60 * 60_000);
  rateLimit(`reset:${email}`, 5, 60 * 60_000); // stops flooding someone's inbox
  const user = await db.select({ id: users.id, locale: users.locale }).from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt))).get();
  if (!user) return null;
  const token = newToken();
  // Earlier links stay valid, so a stranger's request can't cancel the one the owner just asked for.
  await writeTx(async (tx) => {
    await tx.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, new Date()));
    await tx.insert(passwordResetTokens)
      .values({ tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_MS) });
  });
  return { token, locale: user.locale };
}

const usableReset = (token: string) =>
  and(eq(passwordResetTokens.tokenHash, hashToken(token)), gt(passwordResetTokens.expiresAt, new Date()));

export async function isResetTokenValid(token: string) {
  return !!(await db.select({ id: passwordResetTokens.userId }).from(passwordResetTokens).where(usableReset(token)).get());
}

async function revokeAccess(tx: Tx, userId: string) {
  await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await tx.delete(sessions).where(eq(sessions.userId, userId));
  await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)); // a logged-out device must not keep getting reminders
}

/** Single use. Signs the user out everywhere: whoever knew the old password loses access. */
export async function resetPassword(token: string, password: string) {
  if (!(await isResetTokenValid(token))) throw new AppError("reset_invalid"); // before the expensive hash
  const passwordHash = await hashPassword(password);
  await writeTx(async (tx) => {
    const [used] = await tx.delete(passwordResetTokens).where(usableReset(token)).returning({ userId: passwordResetTokens.userId });
    const [user] = used
      ? await tx.update(users).set({ passwordHash }).where(and(eq(users.id, used.userId), isNull(users.deletedAt))).returning({ id: users.id })
      : [];
    if (!user) throw new AppError("reset_invalid");
    await revokeAccess(tx, user.id);
  });
}

/** Find, link or create the account for a Google identity. */
export async function signInWithGoogle(g: GoogleIdentity, locale: Locale) {
  return writeTx(async (tx) => {
    const linked = await tx.select({ id: users.id, deletedAt: users.deletedAt }).from(users).where(eq(users.googleSub, g.sub)).get();
    if (linked?.deletedAt) throw new AppError("google_failed");
    if (linked) return { id: linked.id, outcome: "existing" as const };

    const byEmail = await tx.select().from(users).where(eq(users.email, g.email)).get();
    if (!byEmail) {
      const [user] = await tx.insert(users).values({ name: g.name, email: g.email, googleSub: g.sub, locale }).returning({ id: users.id });
      return { id: user.id, outcome: "created" as const };
    }
    // Only Gmail/Workspace addresses prove who owns the mailbox today; others must log in with their password.
    if (byEmail.deletedAt || byEmail.googleSub || !g.emailAuthoritative) throw new AppError("email_taken");
    // Registration never verified the email, so the password may belong to someone who took this address first.
    await tx.update(users).set({ googleSub: g.sub, passwordHash: null }).where(eq(users.id, byEmail.id));
    await revokeAccess(tx, byEmail.id);
    return { id: byEmail.id, outcome: "linked" as const };
  });
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
