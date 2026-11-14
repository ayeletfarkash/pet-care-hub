import { requireUser } from "@/server/auth/session";
import { hrefOf, listNotifications } from "@/server/services/notifications";
import { fmt, formatLocalDateTime } from "@/i18n";
import { getT } from "@/i18n/server";
import { Badge } from "@/components/care";
import { LinkButton } from "@/components/ui/buttons";
import { ActionForm } from "@/components/forms/action-form";
import { markReadAction } from "@/app/actions/notifications";
import { taskStatusAction } from "@/app/actions/tasks";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.notifications.title };
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const [{ t, locale }, list] = await Promise.all([getT(), listNotifications(user.id)]);
  const k = t.notifications;
  const anyUnread = list.some((n) => !n.readAt);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{k.title}</h1>
        {anyUnread && <ActionForm action={markReadAction} fields={{}} label={k.markAllRead} pendingLabel={t.common.saving} />}
      </div>
      <p className="mb-6 text-muted">{k.intro}</p>
      {list.length === 0 ? <p className="rounded-xl border-2 border-dashed border-line bg-surface p-6">{k.empty}</p> : (
        <ul className="space-y-3">
          {list.map((n) => {
            const title = fmt(k.kinds[n.sourceType], { name: n.params.name, pet: n.params.pet });
            return (
              <li key={n.id} className={`card rounded-xl border-2 bg-surface p-4 ${n.readAt ? "border-divider" : "border-primary"}`}>
                <p className="font-bold">
                  {!n.readAt && <><Badge tone="info">{k.unreadBadge}</Badge>{" "}</>}
                  {title}
                </p>
                <p className="text-sm text-muted"><span className="ltr-value">{formatLocalDateTime(locale, n.params.at ?? n.deliverAt)}</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <LinkButton variant="secondary" href={hrefOf(n)} aria-label={`${k.open}: ${title}`}>{k.open}</LinkButton>
                  {n.taskOpen && (
                    <ActionForm action={taskStatusAction} fields={{ groupId: n.groupId, taskId: n.sourceId, op: "complete" }}
                      label={k.completeTask} ariaLabel={`${k.completeTask}: ${n.params.name}`} pendingLabel={t.common.saving} variant="primary" />
                  )}
                  {!n.readAt && <ActionForm action={markReadAction} fields={{ id: n.id }} label={k.markRead} ariaLabel={`${k.markRead}: ${title}`} pendingLabel={t.common.saving} variant="ghost" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
