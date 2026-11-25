"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { clientKey, destroySession } from "@/server/auth/session";
import { googleEnabled, startGoogle } from "@/server/auth/google";
import { appUrl } from "@/server/app-url";
import { mailEnabled, sendPasswordResetEmail } from "@/server/mailer";
import { authenticate, createPasswordReset, registerUser, resetPassword } from "@/server/services/users";
import { rateLimit } from "@/server/rate-limit";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/server/validation";
import { getT } from "@/i18n/server";
import { GOOGLE_COOKIE, RESET_COOKIE } from "./auth-cookies";
import { completeSignIn } from "./complete-sign-in";
import { handleForm, type FormState } from "./form";

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  return handleForm(fd, registerSchema, async (input) => {
    rateLimit(`register:${await clientKey()}`, Number(process.env.REGISTER_RATE_LIMIT) || 20, 60 * 60_000); // scrypt is expensive; also slows email probing. Raised only for E2E
    const user = await registerUser(input);
    await completeSignIn(user.id, { isNew: true });
  });
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  return handleForm(fd, loginSchema, async ({ email, password }) => {
    const user = await authenticate(email, password, await clientKey());
    await completeSignIn(user.id);
  });
}

export async function googleAction() {
  if (!googleEnabled()) redirect("/login?notice=sign_in_failed&reason=google_failed");
  const { url, flow } = startGoogle();
  (await cookies()).set({
    ...GOOGLE_COOKIE, value: [flow.state, flow.nonce, flow.verifier].join("."),
    httpOnly: true, sameSite: "lax", maxAge: 10 * 60, secure: process.env.NODE_ENV === "production",
  });
  redirect(url);
}

export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  return handleForm(fd, forgotPasswordSchema, async ({ email }) => {
    const { t } = await getT();
    if (!mailEnabled()) return { error: t.auth.mailUnavailable };
    const reset = await createPasswordReset(email, await clientKey());
    // Sent after the response: the answer and its timing are the same whether or not the account exists.
    if (reset)
      after(() => sendPasswordResetEmail(email, appUrl(`/reset-password/${reset.token}`), reset.locale)
        .catch((e) => console.error("password reset email failed:", e.code ?? e.name)));
    return { ok: true, message: t.auth.forgotSent };
  });
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  return handleForm(fd, resetPasswordSchema, async ({ password }) => {
    const jar = await cookies();
    await resetPassword(jar.get(RESET_COOKIE.name)?.value ?? "", password);
    jar.delete(RESET_COOKIE);
    redirect("/login?notice=password_reset");
  });
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
