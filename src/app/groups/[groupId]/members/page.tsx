import { ProfileTabs } from "@/components/profile-tabs";
import { listMembers } from "@/server/services/members";
import { listActiveInvitations } from "@/server/services/invitations";
import { fmt, formatDate } from "@/i18n";
import { getT } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { InviteForm } from "@/components/forms/invite-forms";
import { InviteShare } from "@/components/forms/invite-share";
import { inviteLink } from "@/server/invite-link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { removeMemberAction, revokeInviteAction } from "@/app/actions/members";
import { loadGroup } from "../load";

export async function generateMetadata({ params }: { params: Promise<{ groupId: string }> }) {
  const [{ pet }, { t }] = await Promise.all([loadGroup((await params).groupId), getT()]);
  return { title: fmt(t.members.title, { pet: pet.name }) };
}

export default async function MembersPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [{ user, pet }, { t, locale }] = await Promise.all([loadGroup(groupId), getT()]);
  const [members, invites] = await Promise.all([
    listMembers(user.id, groupId),
    listActiveInvitations(user.id, groupId),
  ]);
  const links = await Promise.all(invites.map((inv) => (inv.token ? inviteLink(inv.token) : null)));
  const m = t.members, i = t.invites;
  const th = "border-b-2 border-line px-3 py-2 text-start font-semibold";
  const td = "border-b border-divider px-3 py-3 align-middle";

  return (
    <>
      <ProfileTabs t={t} groupId={groupId} pet={pet.name} current="members" />
      <h1 className="mb-6 text-3xl font-bold">{fmt(m.title, { pet: pet.name })}</h1>

      <section aria-labelledby="members-h">
        <h2 id="members-h" className="mb-2 text-2xl font-bold">{t.group.members}</h2>
        <p className="mb-3 text-sm text-muted">{m.lastMemberNote}</p>
        {/* Scrollable region is focusable so keyboard users can scroll it on narrow screens. */}
        <div role="region" aria-labelledby="members-h" tabIndex={0} className="overflow-x-auto rounded-xl border-2 border-divider bg-surface">
          <table className="w-full min-w-[36rem] border-collapse">
            <caption className="sr-only">{m.caption}</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>{m.name}</th>
                <th scope="col" className={th}>{m.email}</th>
                <th scope="col" className={th}>{m.joined}</th>
                <th scope="col" className={th}>{m.actions}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((mem) => (
                <tr key={mem.userId}>
                  <th scope="row" className={`${td} text-start font-semibold`}>
                    {mem.name} {mem.userId === user.id && <span className="font-normal text-muted">{t.common.you}</span>}
                  </th>
                  <td className={td}><span className="ltr-value">{mem.email}</span></td>
                  <td className={td}>{formatDate(locale, mem.joinedAt)}</td>
                  <td className={td}>
                    <div className="flex flex-wrap items-start gap-2">
                      {mem.userId !== user.id && (
                        <ConfirmDialog triggerLabel={m.remove} triggerAriaLabel={`${m.remove}: ${mem.name}`} cancelLabel={t.common.cancel}
                          title={fmt(m.removeTitle, { name: mem.name })} body={m.removeBody}>
                          <ActionForm action={removeMemberAction} fields={{ groupId, userId: mem.userId }}
                            label={m.remove} pendingLabel={t.common.saving} variant="danger" />
                        </ConfirmDialog>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="inv-h" className="mt-10">
        <h2 id="inv-h" className="text-2xl font-bold">{i.title}</h2>
        <p className="mb-4 text-muted">{i.intro}</p>
        <InviteForm t={t} groupId={groupId} petName={pet.name} />

        <h3 id="active-h" className="mb-2 mt-8 text-xl font-bold">{i.active}</h3>
        {invites.length === 0 ? (
          <p className="text-muted">{i.none}</p>
        ) : (
          <div role="region" aria-labelledby="active-h" tabIndex={0} className="overflow-x-auto rounded-xl border-2 border-divider bg-surface">
            <table className="w-full min-w-[36rem] border-collapse">
              <caption className="sr-only">{i.active}</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>{i.type}</th>
                  <th scope="col" className={th}>{i.uses}</th>
                  <th scope="col" className={th}>{i.expiresOn}</th>
                  <th scope="col" className={th}>{m.actions}</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv, n) => (
                  <tr key={inv.id}>
                    <td className={td}>
                      {inv.email ? fmt(i.emailType, { email: inv.email }) : inv.reusable ? i.reusableType : i.oneTime}
                    </td>
                    <td className={td}>{inv.useCount}</td>
                    <td className={td}>{formatDate(locale, inv.expiresAt)}</td>
                    <td className={td}>
                      <div className="flex flex-wrap items-start gap-2">
                      {links[n] ? (
                        <InviteShare t={t} link={links[n]} petName={pet.name}
                          context={`${inv.email ?? (inv.reusable ? i.reusableType : i.oneTime)}, ${formatDate(locale, inv.expiresAt)}`} />
                      ) : (
                        <span className="self-center text-sm text-muted">{i.linkUnavailable}</span>
                      )}
                      <ActionForm action={revokeInviteAction} fields={{ groupId, invitationId: inv.id }}
                        label={i.revoke} ariaLabel={`${i.revoke}: ${inv.email ?? (inv.reusable ? i.reusableType : i.oneTime)}, ${formatDate(locale, inv.expiresAt)}`}
                        pendingLabel={t.common.saving} variant="danger" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
