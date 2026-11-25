import { createHash } from "node:crypto";
import { z } from "zod";
import { appUrl } from "../app-url";
import { AppError } from "../errors";
import { newToken } from "../tokens";

// OpenID Connect authorization code flow with PKCE, for sign-in only: no Google API access is requested (PRD §4.1).
export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const redirectUri = () => appUrl("/auth/google/callback");

export function startGoogle() {
  const flow = { state: newToken(), nonce: newToken(), verifier: newToken() };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), flow };
}

const claimsSchema = z.object({
  iss: z.enum(["https://accounts.google.com", "accounts.google.com"]),
  aud: z.string(),
  exp: z.number(),
  nonce: z.string(),
  sub: z.string().min(1).max(255),
  email: z.string().trim().toLowerCase().max(254).email(),
  email_verified: z.literal(true),
  name: z.string().optional(),
  hd: z.string().optional(),
});
export type GoogleIdentity = { sub: string; email: string; name: string; emailAuthoritative: boolean };

/** Exchange the code and validate the ID token. Its signature need not be checked: it comes straight from Google over TLS (OIDC Core §3.1.3.7). */
export async function finishGoogle(code: string, verifier: string, nonce: string): Promise<GoogleIdentity> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        code, code_verifier: verifier, redirect_uri: redirectUri(), grant_type: "authorization_code",
        client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
    const { id_token } = z.object({ id_token: z.string() }).parse(await res.json());
    const c = claimsSchema.parse(JSON.parse(Buffer.from(id_token.split(".")[1] ?? "", "base64url").toString("utf8")));
    if (c.aud !== process.env.GOOGLE_CLIENT_ID || c.nonce !== nonce || c.exp * 1000 <= Date.now()) throw new Error("id token rejected");
    return {
      sub: c.sub,
      email: c.email,
      name: (c.name?.trim() || c.email.split("@")[0]).slice(0, 120),
      emailAuthoritative: c.email.endsWith("@gmail.com") || !!c.hd,
    };
  } catch (e) {
    // Parse errors can quote the token, so their message is not logged.
    console.error("google sign-in failed:", e instanceof SyntaxError ? e.name : (e as Error).message);
    throw new AppError("google_failed");
  }
}
