import { notFound } from "next/navigation";
import { getTask } from "@/server/services/tasks";
import { listMembers } from "@/server/services/members";
import { AppError } from "@/server/errors";
import { fmt, formatDateTime } from "@/i18n";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { Notice } from "@/components/notice";
import { Badge, taskTone } from "@/components/care";
import { LinkButton } from "@/components/ui/buttons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/forms/action-form";
import { CompletionCheckbox } from "@/components/forms/completion-checkbox";
import { TrashIcon } from "@/components/ui/icons";
import { CommentForm, TransferForm } from "@/components/forms/care-forms";
import { commentAction, deleteTaskAction, taskStatusAction, transferAction } from "@/app/actions/tasks";
import { dueText } from "../due";
import { loadGroup } from "../../load";
import { ReminderSection } from "@/components/reminder-section";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ groupId: string; taskId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { groupId, taskId } = await params;
  const [{ user }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const { task: x, assignees, comments, history } = await getTask(user.id, groupId, taskId).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const members = await listMembers(user.id, groupId);
  const k = t.tasks;
  const open = x.status === "new" || x.status === "in_progress";
  const hidden = { groupId, taskId };
  return (
    <div className="mx-auto max-w-3xl">
      <Notice t={t} notice={sp.notice} />
      <BackLink href={`/groups/${groupId}/tasks`} label={k.title} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{x.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={taskTone[x.status]}>{k.statuses[x.status]}</Badge>
            {x.overdue && <Badge tone="danger">{k.overdue}</Badge>}
            <Badge>{k.priority}: {k.priorities[x.priority]}</Badge>
            {x.recurrence !== "none" && <Badge>{x.recurrenceInterval > 1 ? fmt(k.everyN[x.recurrence], { n: x.recurrenceInterval }) : k.recurrences[x.recurrence]}</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {open && <LinkButton variant="secondary" href={`/groups/${groupId}/tasks/${taskId}/edit`}>{t.ui.edit}</LinkButton>}
          <ConfirmDialog triggerIcon={<TrashIcon />} triggerLabel={k.deleteTask} cancelLabel={t.common.cancel} title={fmt(k.deleteTitle, { title: x.title })} body={k.deleteBody}>
            <ActionForm action={deleteTaskAction} fields={hidden} label={k.deleteConfirm} pendingLabel={t.common.saving} variant="danger" className="[&_button]:w-full" />
          </ConfirmDialog>
        </div>
      </div>

      <dl className="card mb-4 grid gap-x-6 gap-y-3 rounded-xl border-2 border-divider bg-surface p-5 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        <dt className="font-semibold text-muted">{k.dueDate}</dt><dd>{dueText(t, locale, x.dueAt)}</dd>
        <dt className="font-semibold text-muted">{k.assignees}</dt><dd>{assignees.length ? assignees.map((a) => a.name).join(", ") : k.unassigned}</dd>
        {x.description && <><dt className="font-semibold text-muted">{k.description}</dt><dd className="whitespace-pre-wrap">{x.description}</dd></>}
      </dl>

      {(open || x.status === "completed") && (
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <CompletionCheckbox action={taskStatusAction} on={{ ...hidden, op: "complete" }} off={{ ...hidden, op: "reopen" }} completed={x.status === "completed"} label={k.complete} visibleLabel={k.complete} />
          {x.status === "new" && <ActionForm action={taskStatusAction} fields={{ ...hidden, op: "start" }} label={k.start} pendingLabel={t.common.saving} />}
        </div>
      )}

      {open && (
        <section aria-labelledby="transfer-h" className="card mb-8 rounded-xl border-2 border-divider bg-surface p-5">
          <h2 id="transfer-h" className="mb-3 text-xl font-bold">{k.transfer}</h2>
          <TransferForm t={t} action={transferAction} hidden={hidden} members={members.filter((m) => !assignees.some((a) => a.userId === m.userId))} />
        </section>
      )}

      {open && <ReminderSection t={t} userId={user.id} groupId={groupId} sourceType="task" sourceId={taskId} />}

      <section aria-labelledby="comments-h" className="mb-8">
        <h2 id="comments-h" className="mb-3 text-2xl font-bold">{k.comments}</h2>
        {comments.length === 0 ? <p className="mb-3 text-muted">{k.noComments}</p> : (
          <ol className="mb-4 space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="card rounded-xl border-2 border-divider bg-surface p-3">
                <p className="text-sm text-muted">{c.name ?? t.ui.formerMember} · {formatDateTime(locale, c.createdAt)}</p>
                <p className="whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ol>
        )}
        <CommentForm t={t} action={commentAction} hidden={hidden} />
      </section>

      <section aria-labelledby="history-h">
        <h2 id="history-h" className="mb-3 text-2xl font-bold">{k.history}</h2>
        <ol className="space-y-1">
          {history.map((h) => (
            <li key={h.id} className="text-sm">
              <span className="font-semibold">{k.actions[h.action as keyof typeof k.actions] ?? h.action}</span> · {h.action === "auto_created" ? k.automatic : h.name ?? t.ui.formerMember} · {formatDateTime(locale, h.createdAt)}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
