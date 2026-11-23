"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { addComment, completeTask, createTask, decideTransfer, deleteTask, reopenTask, requestTransfer, startTask, updateTask } from "@/server/services/tasks";
import { commentSchema, taskSchema } from "@/server/validation";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n/server";
import { handleAction, handleForm, type FormState } from "./form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const refresh = () => revalidatePath("/", "layout"); // tasks appear on the dashboard and calendar too

export async function createTaskAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleForm(fd, taskSchema, async (input) => {
    const id = await createTask(user.id, groupId, input);
    redirect(`/groups/${groupId}/tasks/${id}?notice=saved`);
  });
}

export async function updateTaskAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), taskId = str(fd, "taskId");
  return handleForm(fd, taskSchema, async (input) => {
    await updateTask(user.id, groupId, taskId, input);
    redirect(`/groups/${groupId}/tasks/${taskId}?notice=saved`);
  });
}

/** Status changes from lists and the detail page: op = start | complete | reopen. */
export async function taskStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), taskId = str(fd, "taskId"), op = str(fd, "op");
  return handleAction(async () => {
    if (op === "start") await startTask(user.id, groupId, taskId);
    else if (op === "complete") await completeTask(user.id, groupId, taskId);
    else if (op === "reopen") await reopenTask(user.id, groupId, taskId);
    else throw new AppError("invalid_input");
    refresh();
    const { t } = await getT();
    return { ok: true, message: op === "complete" ? t.tasks.completedMessage : op === "reopen" ? t.tasks.reopenedMessage : t.tasks.saved };
  });
}

/** Permanent delete (Admins; enforced in the service). From the list (`stay`) the row just goes; the task page itself has to redirect. */
export async function deleteTaskAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  return handleAction(async () => {
    await deleteTask(user.id, groupId, str(fd, "taskId"));
    refresh();
    if (str(fd, "stay")) return { ok: true, message: (await getT()).t.tasks.deleted };
    redirect(`/groups/${groupId}/tasks?notice=task_deleted`);
  });
}

export async function commentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), taskId = str(fd, "taskId");
  return handleForm(fd, commentSchema, async ({ body }) => {
    await addComment(user.id, groupId, taskId, body);
    revalidatePath(`/groups/${groupId}/tasks/${taskId}`);
    const { t } = await getT();
    return { ok: true, message: t.tasks.commentAdded };
  });
}

export async function transferAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), taskId = str(fd, "taskId");
  return handleAction(async () => {
    const result = await requestTransfer(user.id, groupId, taskId, str(fd, "toUserId"));
    refresh();
    const { t } = await getT();
    return { ok: true, message: result === "applied" ? t.tasks.transferApplied : t.tasks.transferRequested };
  });
}

export async function decideTransferAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId"), taskId = str(fd, "taskId");
  return handleAction(async () => {
    await decideTransfer(user.id, groupId, taskId, str(fd, "decision") === "approve");
    refresh();
    const { t } = await getT();
    return { ok: true, message: t.tasks.decided };
  });
}
