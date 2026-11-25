import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { GOOGLE_COOKIE } from "@/app/actions/auth-cookies";
import { completeSignIn } from "@/app/actions/complete-sign-in";
import { finishGoogle, googleEnabled } from "@/server/auth/google";
import { AppError, type ErrorCode } from "@/server/errors";
import { signInWithGoogle } from "@/server/services/users";
import { getLocale } from "@/i18n/server";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const [state, nonce, verifier] = jar.get(GOOGLE_COOKIE.name)?.value.split(".") ?? [];
  jar.delete(GOOGLE_COOKIE); // one attempt per start
  const q = req.nextUrl.searchParams;
  const code = q.get("code");
  // The state cookie proves this browser started the flow (login CSRF). Cancelling at Google gives no code.
  if (!googleEnabled() || !code || !state || !nonce || !verifier || q.get("state") !== state) fail("google_failed");

  let user: Awaited<ReturnType<typeof signInWithGoogle>>;
  try {
    user = await signInWithGoogle(await finishGoogle(code, verifier, nonce), await getLocale());
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    fail(e.code);
  }
  await completeSignIn(user.id, { isNew: user.outcome === "created", notice: user.outcome === "linked" ? "google_linked" : undefined });
}

function fail(reason: ErrorCode): never {
  redirect(`/login?notice=sign_in_failed&reason=${reason}`);
}
