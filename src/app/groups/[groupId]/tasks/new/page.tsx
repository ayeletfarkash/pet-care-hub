import { listMembers } from "@/server/services/members";
import { getNotificationPrefs } from "@/server/services/notifications";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/back-link";
import { TaskForm } from "@/components/forms/care-forms";
import { createTaskAction } from "@/app/actions/tasks";
import { loadGroup } from "../../load";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.tasks.createTitle };
}

export default async function NewTaskPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [{ user }, { t }] = await Promise.all([loadGroup(groupId), getT()]);
  const [members, prefs] = await Promise.all([listMembers(user.id, groupId), getNotificationPrefs(user.id)]);
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/groups/${groupId}/tasks`} label={t.tasks.title} />
      <h1 className="mb-6 text-3xl font-bold">{t.tasks.createTitle}</h1>
      <TaskForm t={t} action={createTaskAction} hidden={{ groupId }} members={members} submitLabel={t.common.save} reminder={{ prefsOff: !prefs.tasks }} />
    </div>
  );
}
