import { cookies } from "next/headers";
import { INVITE_COOKIE } from "@/app/actions/invite-cookie";
import { joinAction } from "@/app/actions/members";
import { getCurrentUser } from "@/server/auth/session";
import { previewInvitation } from "@/server/services/invitations";
import { fmt } from "@/i18n";
import { getT } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Notice } from "@/components/notice";
import { LinkButton } from "@/components/ui/buttons";
import { SpeciesIcon } from "@/components/species-icon";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.join.title };
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const [{ t }, user, sp] = await Promise.all([getT(), getCurrentUser(), searchParams]);
  const token = (await cookies()).get(INVITE_COOKIE)?.value;
  const inv = token ? await previewInvitation(token) : null;

  return (
    <div className="mx-auto max-w-md">
      <Notice t={t} notice={sp.notice} />
      <h1 className="mb-6 text-3xl font-bold">{t.join.title}</h1>
      {!inv ? (
        <p role="alert" className="rounded-xl border-2 border-danger bg-danger-bg p-4 font-semibold text-danger">{t.join.invalid}</p>
      ) : (
        <div className="card rounded-xl border-2 border-divider bg-surface p-6">
          <div className="mb-4 flex items-center gap-4">
            <SpeciesIcon species={inv.species} />
            <div>
              <p className="text-lg font-bold">{fmt(t.join.invited, { pet: inv.petName })}</p>
            </div>
          </div>
          {user ? (
            // A confirm step: opening the link alone never joins.
            <ActionForm action={joinAction} fields={{}} label={fmt(t.join.joinButton, { pet: inv.petName })}
              pendingLabel={t.common.saving} variant="primary" />
          ) : (
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/register">{t.join.registerToJoin}</LinkButton>
              <LinkButton href="/login" variant="secondary">{t.join.loginToJoin}</LinkButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
