import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, writeTx } from "../db";
import { passwordResetTokens, pushSubscriptions, sessions, users } from "../db/schema";
import { makeUser } from "../../test/factories";
import { appUrl } from "../app-url";
import { finishGoogle, startGoogle, type GoogleIdentity } from "../auth/google";
import { resetRateLimits } from "../rate-limit";
import { hashToken, newToken } from "../tokens";
import { authenticate, createPasswordReset, isResetTokenValid, resetPassword, signInWithGoogle } from "./users";

const code = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return (e as { code?: string }).code ?? String(e); }
};
const tokenFor = async (email: string) => (await createPasswordReset(email, "ip"))!.token;
const userRow = (id: string) => db.select().from(users).where(eq(users.id, id)).get();

/** A logged-in device with push turned on. */
async function addDevice(userId: string) {
  await writeTx(async (tx) => {
    await tx.insert(sessions).values({ userId, tokenHash: hashToken(newToken()), expiresAt: new Date(Date.now() + 60_000) });
    await tx.insert(pushSubscriptions).values({ userId, endpoint: `https://push.test/${newToken()}`, p256dh: "k", auth: "a" });
  });
}
const devices = async (userId: string) =>
  (await db.select().from(sessions).where(eq(sessions.userId, userId))).length +
  (await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).length;

beforeEach(() => resetRateLimits());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("password reset", () => {
  it("sets the new password once and logs out every device", async () => {
    const u = await makeUser(), other = await makeUser();
    await addDevice(u.id);
    await addDevice(other.id);
    const first = await tokenFor(u.email), second = await tokenFor(u.email);
    expect(await isResetTokenValid(first)).toBe(true); // a later request doesn't cancel an earlier one
    await resetPassword(second, "new-password-1");

    expect(await authenticate(u.email, "new-password-1", "ip")).toEqual({ id: u.id });
    expect(await code(authenticate(u.email, "password123", "ip"))).toBe("invalid_credentials");
    expect(await devices(u.id)).toBe(0);
    expect(await devices(other.id)).toBe(2);
    expect(await code(resetPassword(second, "new-password-2"))).toBe("reset_invalid");
    expect(await code(resetPassword(first, "new-password-2"))).toBe("reset_invalid");
  });

  it("two simultaneous uses: only one wins", async () => {
    const u = await makeUser();
    const t = await tokenFor(u.email);
    const r = await Promise.all([code(resetPassword(t, "new-password-1")), code(resetPassword(t, "new-password-2"))]);
    expect(r.sort()).toEqual(["ok", "reset_invalid"]);
  });

  it("rejects expired and made-up tokens, and deleted accounts; stores only a hash", async () => {
    const u = await makeUser();
    const t = await tokenFor(u.email);
    expect(await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, t)).get()).toBeUndefined();
    await writeTx((tx) => tx.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(passwordResetTokens.userId, u.id)));
    expect(await isResetTokenValid(t)).toBe(false);
    expect(await code(resetPassword(t, "new-password-1"))).toBe("reset_invalid");
    expect(await code(resetPassword("", "new-password-1"))).toBe("reset_invalid");

    const gone = await makeUser();
    const goneToken = await tokenFor(gone.email);
    await writeTx((tx) => tx.update(users).set({ deletedAt: new Date() }).where(eq(users.id, gone.id)));
    expect(await code(resetPassword(goneToken, "new-password-1"))).toBe("reset_invalid");
    expect(await createPasswordReset(gone.email, "ip")).toBeNull();
  });

  it("limits requests the same way for known and unknown emails", async () => {
    const u = await makeUser();
    for (const email of [u.email, "nobody@example.test"]) {
      resetRateLimits();
      for (let i = 0; i < 5; i++) expect(await code(createPasswordReset(email, "ip"))).toBe("ok");
      expect(await code(createPasswordReset(email, "ip"))).toBe("rate_limited");
    }
  });

  it("links never come from the request", () => {
    vi.stubEnv("APP_URL", "https://pets.example/");
    expect(appUrl("/reset-password/x")).toBe("https://pets.example/reset-password/x");
  });
});

describe("google sign-in", () => {
  const identity = (o: Partial<GoogleIdentity> = {}): GoogleIdentity =>
    ({ sub: newToken(), email: `${newToken().toLowerCase()}@gmail.com`, name: "Gali", emailAuthoritative: true, ...o });

  it("creates an account without a password, then finds it again even if the Google email changed", async () => {
    const g = identity();
    const created = await signInWithGoogle(g, "en");
    expect(created.outcome).toBe("created");
    expect(await userRow(created.id)).toMatchObject({ email: g.email, name: "Gali", locale: "en", passwordHash: null });
    expect(await code(authenticate(g.email, "password123", "ip"))).toBe("invalid_credentials");
    expect(await signInWithGoogle({ ...g, email: "moved@gmail.com" }, "he")).toEqual({ id: created.id, outcome: "existing" });
    // A password can be added later with a reset
    await resetPassword(await tokenFor(g.email), "new-password-1");
    expect(await authenticate(g.email, "new-password-1", "ip")).toEqual({ id: created.id });
  });

  it("linking an existing account removes its unverified password, devices and reset links", async () => {
    const u = await makeUser();
    await addDevice(u.id);
    const t = await tokenFor(u.email);
    expect(await signInWithGoogle(identity({ email: u.email }), "he")).toEqual({ id: u.id, outcome: "linked" });
    expect(await code(authenticate(u.email, "password123", "ip"))).toBe("invalid_credentials");
    expect(await devices(u.id)).toBe(0);
    expect(await isResetTokenValid(t)).toBe(false);
  });

  it("never links an account by an email Google doesn't vouch for, or one already linked to another Google account", async () => {
    const u = await makeUser();
    expect(await code(signInWithGoogle(identity({ email: u.email, emailAuthoritative: false }), "he"))).toBe("email_taken");
    expect(await authenticate(u.email, "password123", "ip")).toEqual({ id: u.id });
    await signInWithGoogle(identity({ email: u.email }), "he");
    expect(await code(signInWithGoogle(identity({ email: u.email }), "he"))).toBe("email_taken");
  });

  it("refuses deleted accounts", async () => {
    const g = identity();
    const { id } = await signInWithGoogle(g, "he");
    await writeTx((tx) => tx.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id)));
    expect(await code(signInWithGoogle(g, "he"))).toBe("google_failed");
    expect(await code(signInWithGoogle(identity({ email: g.email }), "he"))).toBe("email_taken");
  });

  it("asks Google only for identity scopes, with state, nonce and PKCE", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    const { url, flow } = startGoogle();
    const q = new URL(url).searchParams;
    expect(q.get("scope")).toBe("openid email profile");
    expect(q.get("redirect_uri")).toBe("http://localhost:3000/auth/google/callback");
    expect([q.get("state"), q.get("nonce")]).toEqual([flow.state, flow.nonce]);
    expect(q.get("code_challenge")).not.toBe(flow.verifier);
    expect(url).not.toContain(flow.verifier);
  });

  it("accepts a valid ID token and rejects any wrong claim", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const good = {
      iss: "https://accounts.google.com", aud: "cid", exp: Date.now() / 1000 + 60, nonce: "n", sub: "1",
      email: "Gali@Gmail.com", email_verified: true, name: "Gali",
    };
    const finish = (claims: object, status = 200) => {
      vi.stubGlobal("fetch", async () => Response.json({ id_token: `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s` }, { status }));
      return finishGoogle("code", "verifier", "n");
    };
    expect(await finish(good)).toEqual({ sub: "1", email: "gali@gmail.com", name: "Gali", emailAuthoritative: true });
    expect(await finish({ ...good, email: "a@yahoo.com" })).toMatchObject({ emailAuthoritative: false });
    expect(await finish({ ...good, email: "a@company.com", hd: "company.com" })).toMatchObject({ emailAuthoritative: true });
    expect(await finish({ ...good, name: undefined })).toMatchObject({ name: "gali" });
    for (const bad of [{ iss: "https://evil.example" }, { aud: "other" }, { exp: 1 }, { nonce: "x" }, { email_verified: false }, { sub: "" }, { email: undefined }])
      expect(await code(finish({ ...good, ...bad })), JSON.stringify(bad)).toBe("google_failed");
    expect(await code(finish(good, 400))).toBe("google_failed");
  });
});
