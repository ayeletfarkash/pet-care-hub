import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe. Only its SHA-256 is stored. */
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
