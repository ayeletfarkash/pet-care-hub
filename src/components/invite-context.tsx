import { cookies } from "next/headers";
import { INVITE_COOKIE } from "@/app/actions/invite-cookie";
import { previewInvitation } from "@/server/services/invitations";
import { fmt, type Dict } from "@/i18n";

/** On login/register: tells the visitor which group they'll join after signing in. */
export async function InviteContext({ t }: { t: Dict }) {
  const token = (await cookies()).get(INVITE_COOKIE)?.value;
  const inv = token ? await previewInvitation(token) : null;
  if (!inv) return null;
  return (
    <p role="status" className="mb-4 rounded-lg border-2 border-line bg-accent p-3">
      {fmt(t.auth.joinNotice, { pet: inv.petName })}
    </p>
  );
}
