import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, writeTx } from "../db";
import { sessions, users } from "../db/schema";
import { hashToken, newToken } from "../tokens";

const COOKIE = "pch_session";
const MAX_AGE_S = 30 * 24 * 60 * 60;
const secure = process.env.NODE_ENV === "production";

export async function createSession(userId: string) {
  const token = newToken();
  await writeTx((tx) =>
    tx.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + MAX_AGE_S * 1000) }),
  );
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: MAX_AGE_S });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await writeTx((tx) => tx.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))));
  jar.delete(COOKIE);
}

/** Current user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = await db
    .select({ id: users.id, name: users.name, email: users.email, locale: users.locale })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), isNull(users.deletedAt)))
    .get();
  return row ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Client key for rate limiting. Forwarding headers are client-controlled, so they are only
 * trusted when TRUST_PROXY=1 (the app runs behind a proxy that overwrites them).
 */
export async function clientKey() {
  if (process.env.TRUST_PROXY !== "1") return "direct";
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || h.get("x-real-ip") || "direct";
}
