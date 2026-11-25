"use client";

import { useId, useRef, useState, useTransition } from "react";
import type { FormState } from "@/app/actions/form";
import { FormStatus } from "../ui/form-status";
import { announce } from "../live-region";
import { focusTargetFor } from "./action-form";

type Fields = Record<string, string>;

/**
 * Completion checkbox for tasks, events, doses and routine activities: checking sends `on`, unchecking
 * sends `off`. Without `off` a checked box is locked, because unchecking would delete the record of who
 * did it and when (doses, routine logs). Saves on change; shows the new state at once and reverts if
 * the server refuses. Not a <form>: pressing Enter on a checkbox could submit it without an operation.
 */
export function CompletionCheckbox({ action, on, off, lockedMessage, completed, label, visibleLabel }: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  on: Fields;
  off?: Fields;
  lockedMessage?: string; // describes a locked box; shown when it is clicked
  completed: boolean;
  label: string; // accessible name, e.g. "Mark completed: Walk" (state is conveyed by checked)
  visibleLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [checked, setChecked] = useState(completed);
  // Follow the server without remounting, so keyboard focus stays on the checkbox.
  const [saved, setSaved] = useState(completed);
  if (completed !== saved) { setSaved(completed); setChecked(completed); }
  const [error, setError] = useState<string>();
  const [showLocked, setShowLocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const locked = checked && !off;
  const lockedId = useId();

  const toggle = (next: boolean) => {
    if (pending || !ref.current) return;
    const fields = next ? on : off;
    if (!fields) { // locked
      if (lockedMessage) { setShowLocked(true); announce(lockedMessage); }
      return;
    }
    const fallback = focusTargetFor(ref.current);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    setChecked(next);
    setError(undefined);
    startTransition(async () => {
      const result = await action({}, fd);
      if (!result.ok) { setChecked(!next); setError(result.error); return; }
      if (result.message) announce(result.message);
      // In a list the row may move elsewhere: keep keyboard focus somewhere sensible.
      setTimeout(() => { if (!ref.current?.isConnected) fallback()?.focus(); }, 150);
    });
  };

  return (
    <div ref={ref} className="contents">
      <label className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-2 font-semibold">
        <input type="checkbox" className="size-6 cursor-pointer accent-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-70" checked={checked} aria-label={visibleLabel ? undefined : label}
          aria-disabled={pending || locked || undefined} aria-describedby={locked && lockedMessage ? lockedId : undefined} onChange={(e) => toggle(e.target.checked)} />
        {visibleLabel}
      </label>
      {error && <div className="order-last basis-full"><FormStatus state={{ error }} /></div>}
      {locked && lockedMessage && <p id={lockedId} hidden={!showLocked} className="order-last basis-full text-sm text-muted">{lockedMessage}</p>}
    </div>
  );
}

/** Keeps rows without a checkbox (upcoming, cancelled) aligned with the others. */
export const NoCheckbox = () => <span aria-hidden="true" className="w-11 shrink-0" />;
