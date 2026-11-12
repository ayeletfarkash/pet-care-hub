import { BackLink } from "@/components/back-link";
import { listMembers } from "@/server/services/members";
import { listActiveInvitations } from "@/server/services/invitations";
import { fmt, formatDate } from "@/i18n";
import { getT } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { InviteForms } from "@/components/forms/invite-forms";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { changeRoleAction, removeMemberAction, revokeInviteAction } from "@/app/actions/members";
import { loadGroup } from "../load";

export async function generateMetadata({ params }: { params: Promise<{ groupId: string }> }) {
  const [{ pet }, { t }] = await Promise.all([loadGroup((await params).groupId), getT()]);
  return { title: fmt(t.members.title, { pet: pet.name }) };
}

export default async function MembersPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [{ user, pet, role }, { t, locale }] = await Promise.all([loadGroup(groupId), getT()]);
  const isAdmin = role === "admin";
  const [members, invites] = await Promise.all([
    listMembers(user.id, groupId),
    isAdmin ? listActiveInvitations(user.id, groupId) : Promise.resolve([]),
  ]);
  const m = t.members, i = t.invites;
  const th = "border-b-2 border-line px-3 py-2 text-start font-semibold";
  const td = "border-b border-divider px-3 py-3 align-middle";

  return (
    <>
      <BackLink href={`/groups/${groupId}`} label={pet.name} />
      <h1 className="mb-6 text-3xl font-bold">{fmt(m.title, { pet: pet.name })}</h1>

      <section aria-labelledby="members-h">
        <h2 id="members-h" className="mb-2 text-2xl font-bold">{t.group.members}</h2>
        {isAdmin && <p className="mb-3 text-sm text-muted">{m.lastAdminNote}</p>}
        {/* Scrollable region is focusable so keyboard users can scroll it on narrow screens. */}
        <div role="region" aria-labelledby="members-h" tabIndex={0} className="overflow-x-auto rounded-xl border-2 border-divider bg-surface">
          <table className="w-full min-w-[36rem] border-collapse">
            <caption className="sr-only">{m.caption}</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>{m.name}</th>
                <th scope="col" className={th}>{m.email}</th>
                <th scope="col" className={th}>{m.role}</th>
                <th scope="col" className={th}>{m.joined}</th>
                {isAdmin && <th scope="col" className={th}>{m.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((mem) => (
                <tr key={mem.userId}>
                  <th scope="row" className={`${td} text-start font-semibold`}>
                    {mem.name} {mem.userId === user.id && <span className="font-normal text-muted">{t.common.you}</span>}
                  </th>
                  <td className={td}><span className="ltr-value">{mem.email}</span></td>
                  <td className={td}>{t.roles[mem.role]}</td>
                  <td className={td}>{formatDate(locale, mem.joinedAt)}</td>
                  {isAdmin && (
                    <td className={td}>
                      <div className="flex flex-wrap items-start gap-2">
                        <ActionForm action={changeRoleAction}
                          fields={{ groupId, userId: mem.userId, role: mem.role === "admin" ? "caregiver" : "admin" }}
                          label={mem.role === "admin" ? m.makeCaregiver : m.makeAdmin}
                          ariaLabel={`${mem.role === "admin" ? m.makeCaregiver : m.makeAdmin}: ${mem.name}`} pendingLabel={t.common.saving} />
                        {mem.userId !== user.id && (
                          <ConfirmDialog triggerLabel={m.remove} triggerAriaLabel={`${m.remove}: ${mem.name}`} cancelLabel={t.common.cancel}
                            title={fmt(m.removeTitle, { name: mem.name })} body={m.removeBody}>
                            <ActionForm action={removeMemberAction} fields={{ groupId, userId: mem.userId }}
                              label={m.remove} pendingLabel={t.common.saving} variant="danger" />
                          </ConfirmDialog>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (
        <section aria-labelledby="inv-h" className="mt-10">
          <h2 id="inv-h" className="text-2xl font-bold">{i.title}</h2>
          <p className="mb-4 text-muted">{i.intro}</p>
          <InviteForms t={t} groupId={groupId} />

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
                    <th scope="col" className={th}>{m.role}</th>
                    <th scope="col" className={th}>{i.uses}</th>
                    <th scope="col" className={th}>{i.expiresOn}</th>
                    <th scope="col" className={th}>{m.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => (
                    <tr key={inv.id}>
                      <td className={td}>
                        {inv.email ? fmt(i.emailType, { email: inv.email }) : inv.reusable ? i.reusableType : i.oneTime}
                      </td>
                      <td className={td}>{t.roles[inv.role]}</td>
                      <td className={td}>{inv.useCount}</td>
                      <td className={td}>{formatDate(locale, inv.expiresAt)}</td>
                      <td className={td}>
                        <ActionForm action={revokeInviteAction} fields={{ groupId, invitationId: inv.id }}
                          label={i.revoke} ariaLabel={`${i.revoke}: ${inv.email ?? (inv.reusable ? i.reusableType : i.oneTime)}, ${formatDate(locale, inv.expiresAt)}`}
                          pendingLabel={t.common.saving} variant="danger" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
