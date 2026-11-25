import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe. Only its SHA-256 is used for lookups. */
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Invitation tokens are also kept encrypted so members can copy/share an active link again.
function key() {
  const secret = process.env.INVITE_LINK_SECRET;
  if (!secret) {
    // Fail closed: the known fallback key is only for local dev and tests.
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") throw new Error("INVITE_LINK_SECRET is not set");
    return createHash("sha256").update("dev-only-invite-link-secret").digest(); // dev/test only
  }
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM; output is iv.tag.ciphertext (base64url). */
export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

/** Null when the value is missing, tampered with, or encrypted under another secret. */
export function decryptToken(value: string | null) {
  if (!value) return null;
  try {
    const [iv, tag, enc] = value.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
