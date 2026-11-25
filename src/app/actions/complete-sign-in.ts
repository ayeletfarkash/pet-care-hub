import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession } from "@/server/auth/session";
import { acceptInvitation } from "@/server/services/invitations";
import { AppError } from "@/server/errors";
import { LOCALE_COOKIE } from "@/i18n";
import { INVITE_COOKIE } from "./invite-cookie";

/** Start the session and go to the dashboard, or on to the invitation the visitor came from. */
export async function completeSignIn(userId: string, { isNew = false, notice }: { isNew?: boolean; notice?: string } = {}): Promise<never> {
  await createSession(userId);
  const jar = await cookies();
  jar.delete(LOCALE_COOKIE); // the account's language now applies
  const query = notice ? `?notice=${notice}` : "";
  const token = jar.get(INVITE_COOKIE)?.value;
  if (!token) redirect(`/${query}`);
  if (!isNew) redirect(`/join${query}`);
  jar.delete(INVITE_COOKIE);
  // New users are added automatically after registering (PRD §4.4). If that fails, the account still exists.
  let groupId: string;
  try {
    groupId = await acceptInvitation(userId, token);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    redirect(`/?notice=join_failed&reason=${e.code}`);
  }
  redirect(`/groups/${groupId}?notice=joined`);
}
