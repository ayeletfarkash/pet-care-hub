"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { inviteLink } from "@/server/invite-link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { changeRole, removeMember } from "@/server/services/members";
import { acceptInvitation, createInvitation, revokeInvitation } from "@/server/services/invitations";
import { getPetForMember } from "@/server/services/pets";
import { sendInvitationEmail } from "@/server/mailer";
import { rateLimit } from "@/server/rate-limit";
import { invitationSchema, roleSchema } from "@/server/validation";
import { AppError } from "@/server/errors";
import { fmt } from "@/i18n";
import { getT } from "@/i18n/server";
import { handleAction, handleForm, type FormState } from "./form";
import { INVITE_COOKIE } from "./invite-cookie";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const membersPath = (g: string) => `/groups/${g}/members`;


export async function changeRoleAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    const role = roleSchema.parse(str(fd, "role"));
    await changeRole(user.id, groupId, str(fd, "userId"), role);
    revalidatePath(membersPath(groupId));
    const { t } = await getT();
    return { ok: true, message: t.members.roleChanged };
  });
}

export async function removeMemberAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await removeMember(user.id, groupId, str(fd, "userId"));
    revalidatePath(membersPath(groupId));
    const { t } = await getT();
    return { ok: true, message: t.members.removed };
  });
}

export async function createInviteAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleForm(fd, invitationSchema, async (input) => {
    rateLimit(`invite:${user.id}`, 30, 60 * 60_000);
    const token = await createInvitation(user.id, groupId, input);
    const link = await inviteLink(token);
    const { t } = await getT();
    revalidatePath(membersPath(groupId));
    if (input.email) {
      const { pet } = await getPetForMember(user.id, groupId);
      await sendInvitationEmail(input.email, link, pet.name);
      return { ok: true, message: fmt(t.invites.emailSent, { email: input.email }), data: { link } };
    }
    return { ok: true, message: t.invites.created, data: { link } };
  });
}

export async function revokeInviteAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await revokeInvitation(user.id, groupId, str(fd, "invitationId"));
    revalidatePath(membersPath(groupId));
    const { t } = await getT();
    return { ok: true, message: t.invites.revoked };
  });
}

export async function joinAction(_: FormState): Promise<FormState> {
  const user = await requireUser();
  return handleAction(async () => {
    const jar = await cookies();
    const token = jar.get(INVITE_COOKIE)?.value;
    if (!token) throw new AppError("invite_invalid");
    rateLimit(`join:${user.id}`, 20, 15 * 60_000);
    let groupId: string;
    try {
      groupId = await acceptInvitation(user.id, token);
    } finally {
      jar.delete(INVITE_COOKIE); // one attempt per link visit
    }
    redirect(`/groups/${groupId}?notice=joined`);
  });
}
