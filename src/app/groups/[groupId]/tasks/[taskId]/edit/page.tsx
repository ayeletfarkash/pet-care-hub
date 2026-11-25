import { notFound } from "next/navigation";
import { getTask } from "@/server/services/tasks";
import { listMembers } from "@/server/services/members";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { TaskForm } from "@/components/forms/care-forms";
import { updateTaskAction } from "@/app/actions/tasks";
import { loadGroup } from "../../../load";

export default async function EditTaskPage({ params }: { params: Promise<{ groupId: string; taskId: string }> }) {
  const { groupId, taskId } = await params;
  const [{ user }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  const [{ task: x, assignees }, members] = await Promise.all([getTask(user.id, groupId, taskId).catch(() => notFound()), listMembers(user.id, groupId)]);
  const initial = {
    ...x,
    dueDate: x.dueAt?.slice(0, 10) ?? "",
    dueTime: x.dueAt && !x.dueAt.endsWith("T23:59") ? x.dueAt.slice(11) : "",
    assignees: assignees.map((a) => a.userId),
  };
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/tasks/${taskId}`} label={x.title} />
      <h1 className="mb-6 text-3xl font-bold">{t.tasks.editTitle}</h1>
      <TaskForm t={t} action={updateTaskAction} hidden={{ groupId, taskId }} initial={initial} members={members} submitLabel={t.common.save} />
    </div>
  );
}
