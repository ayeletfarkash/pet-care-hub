import Link from "next/link";
import { listTasks } from "@/server/services/tasks";
import { fmt } from "@/i18n";
import { dueText } from "./due";
import { getT } from "@/i18n/server";
import { Notice } from "@/components/notice";
import { Badge, Empty, rowBodyClass, rowClass, SectionHeader, taskTone } from "@/components/care";
import { ActionForm } from "@/components/forms/action-form";
import { CompletionCheckbox } from "@/components/forms/completion-checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TrashIcon } from "@/components/ui/icons";
import { deleteTaskAction, taskStatusAction } from "@/app/actions/tasks";
import { loadGroup } from "../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.tasks.title };
}

export default async function TasksPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ view?: string; notice?: string }> }) {
  const { groupId } = await params;
  const [{ user }, { t, locale }, sp] = await Promise.all([loadGroup(groupId), getT(), searchParams]);
  const view = sp.view === "done" ? "done" : "open";
  const { tasks, role } = await listTasks(user.id, groupId, view);
  const k = t.tasks;
  const tab = "-mb-0.5 inline-flex min-h-11 items-center border-b-4 border-transparent px-3 font-semibold text-fg no-underline hover:border-line aria-[current=page]:border-primary";
  return (
    <>
      <Notice t={t} notice={sp.notice} />
      <SectionHeader as="h1" id="tasks-h" title={k.title} action={{ href: `/groups/${groupId}/tasks/new`, label: k.add }} />
      <nav aria-label={k.title} className="mb-4 border-b-2 border-divider">
        <ul className="flex gap-1">
          <li><Link className={tab} href="?" aria-current={view === "open" ? "page" : undefined}>{k.open}</Link></li>
          <li><Link className={tab} href="?view=done" aria-current={view === "done" ? "page" : undefined}>{k.done}</Link></li>
        </ul>
      </nav>
      {tasks.length === 0 ? <Empty>{view === "open" ? k.empty : k.emptyDone}</Empty> : (
        <ul className="space-y-2">
          {tasks.map((x) => (
            <li key={x.id} className={rowClass}>
              <CompletionCheckbox action={taskStatusAction} on={{ groupId, taskId: x.id, op: "complete" }} off={{ groupId, taskId: x.id, op: "reopen" }} completed={x.status === "completed"} label={fmt(k.completeLabel, { title: x.title })} />
              <div className={rowBodyClass}>
                <p className="font-bold"><Link href={`/groups/${groupId}/tasks/${x.id}`}>{x.title}</Link></p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={taskTone[x.status]}>{k.statuses[x.status]}</Badge>
                  {x.overdue && <Badge tone="danger">{k.overdue}</Badge>}
                  {x.priority === "high" && <Badge tone="danger">{k.priorities.high}</Badge>}
                  <span>{dueText(t, locale, x.dueAt)}</span>
                  <span className="text-muted">· {x.assignees.length ? x.assignees.map((a) => a.name).join(", ") : k.unassigned}</span>
                </p>
              </div>
              {role === "admin" && (
                <ConfirmDialog triggerIcon={<TrashIcon />} triggerLabel={k.deleteTask} triggerAriaLabel={fmt(k.deleteLabel, { title: x.title })}
                  cancelLabel={t.common.cancel} title={fmt(k.deleteTitle, { title: x.title })} body={k.deleteBody}>
                  <ActionForm action={deleteTaskAction} fields={{ groupId, taskId: x.id, stay: "1" }} label={k.deleteConfirm} pendingLabel={t.common.saving} variant="danger" className="[&_button]:w-full" />
                </ConfirmDialog>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
