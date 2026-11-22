"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import type { FormState } from "@/app/actions/form";
import { taskStatusAction } from "@/app/actions/tasks";
import { FormStatus } from "../ui/form-status";
import { announce } from "../live-region";
import { focusTargetFor } from "./action-form";

/**
 * Completion checkbox: checking completes the task, unchecking reopens it (both roles). Submits on
 * change; the checkbox shows the new state at once and reverts if the server refuses.
 */
export function TaskCheckbox({ groupId, taskId, completed, label, visibleLabel }: {
  groupId: string; taskId: string; completed: boolean;
  label: string; // accessible name, e.g. "Mark completed: Walk" (state is conveyed by checked)
  visibleLabel?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [checked, setChecked] = useState(completed);
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const fallback = formRef.current ? focusTargetFor(formRef.current) : null;
    const result = await taskStatusAction(prev, fd);
    if (result.ok) {
      if (result.message) announce(result.message);
      // The row usually moves to the other list: keep keyboard focus somewhere sensible.
      if (fallback) setTimeout(() => { if (!formRef.current?.isConnected) fallback()?.focus(); }, 150);
    } else setChecked(completed);
    return result;
  }, {} as FormState);
  const id = `done-${taskId}`;
  return (
    <form ref={formRef} action={formAction} className="flex items-center">
      <FormStatus state={state.error ? state : {}} />
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="taskId" value={taskId} />
      <label htmlFor={id} className="inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 font-semibold">
        <input id={id} type="checkbox" className="size-6 cursor-pointer accent-primary" checked={checked} aria-label={visibleLabel ? undefined : label}
          aria-disabled={pending || undefined}
          onChange={(e) => {
            if (pending || !formRef.current) return;
            const fd = new FormData(formRef.current);
            fd.set("op", e.target.checked ? "complete" : "reopen");
            setChecked(e.target.checked);
            startTransition(() => formAction(fd));
          }} />
        {visibleLabel}
      </label>
    </form>
  );
}
