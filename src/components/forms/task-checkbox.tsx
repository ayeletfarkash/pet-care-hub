"use client";

import { useRef, useState, useTransition } from "react";
import { taskStatusAction } from "@/app/actions/tasks";
import { FormStatus } from "../ui/form-status";
import { announce } from "../live-region";
import { focusTargetFor } from "./action-form";

/**
 * Completion checkbox: checking completes the task, unchecking reopens it (both roles). Saves on
 * change; the checkbox shows the new state at once and reverts if the server refuses. Not a <form>:
 * pressing Enter on a checkbox could submit it without an operation.
 */
export function TaskCheckbox({ groupId, taskId, completed, label, visibleLabel }: {
  groupId: string; taskId: string; completed: boolean;
  label: string; // accessible name, e.g. "Mark completed: Walk" (state is conveyed by checked)
  visibleLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [checked, setChecked] = useState(completed);
  // Follow the server without remounting, so keyboard focus stays on the checkbox.
  const [saved, setSaved] = useState(completed);
  if (completed !== saved) { setSaved(completed); setChecked(completed); }
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    if (pending || !ref.current) return;
    const fallback = focusTargetFor(ref.current);
    const fd = new FormData();
    for (const [k, v] of Object.entries({ groupId, taskId, op: next ? "complete" : "reopen" })) fd.set(k, v);
    setChecked(next);
    setError(undefined);
    startTransition(async () => {
      const result = await taskStatusAction({}, fd);
      if (!result.ok) { setChecked(!next); setError(result.error); return; }
      if (result.message) announce(result.message);
      // In a list the row moves to the other tab: keep keyboard focus somewhere sensible.
      setTimeout(() => { if (!ref.current?.isConnected) fallback()?.focus(); }, 150);
    });
  };

  return (
    <div ref={ref} className="flex flex-wrap items-center">
      <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 font-semibold">
        <input type="checkbox" className="size-6 cursor-pointer accent-primary" checked={checked} aria-label={visibleLabel ? undefined : label}
          aria-disabled={pending || undefined} onChange={(e) => toggle(e.target.checked)} />
        {visibleLabel}
      </label>
      {error && <FormStatus state={{ error }} />}
    </div>
  );
}
