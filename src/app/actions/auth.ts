"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clientKey, createSession, destroySession } from "@/server/auth/session";
import { authenticate, registerUser } from "@/server/services/users";
import { acceptInvitation } from "@/server/services/invitations";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { loginSchema, registerSchema } from "@/server/validation";
import { LOCALE_COOKIE } from "@/i18n";
import { handleForm, type FormState } from "./form";
import { INVITE_COOKIE } from "./invite-cookie";

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  return handleForm(fd, registerSchema, async (input) => {
    rateLimit(`register:${await clientKey()}`, Number(process.env.REGISTER_RATE_LIMIT) || 20, 60 * 60_000); // scrypt is expensive; also slows email probing. Raised only for E2E
    const user = await registerUser(input);
    await createSession(user.id);
    const jar = await cookies();
    jar.delete(LOCALE_COOKIE); // the account's language now applies
    const token = jar.get(INVITE_COOKIE)?.value;
    if (!token) redirect("/");
    jar.delete(INVITE_COOKIE);
    // New users are added automatically after registering (PRD §4.4). If that fails, the account still exists.
    let groupId: string;
    try {
      groupId = await acceptInvitation(user.id, token);
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      redirect(`/?notice=join_failed&reason=${e.code}`);
    }
    redirect(`/groups/${groupId}?notice=joined`);
  });
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  return handleForm(fd, loginSchema, async ({ email, password }) => {
    const user = await authenticate(email, password, await clientKey());
    await createSession(user.id);
    const jar = await cookies();
    jar.delete(LOCALE_COOKIE);
    redirect(jar.get(INVITE_COOKIE) ? "/join" : "/");
  });
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
