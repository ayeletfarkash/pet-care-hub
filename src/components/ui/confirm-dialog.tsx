"use client";

import { useId, useRef, type ReactNode } from "react";
import { Button } from "./buttons";

/**
 * Confirmation for destructive actions (PRD §18.4). Native <dialog> + showModal() gives focus
 * containment, Esc to close and an inert background; focus returns to the trigger on close.
 */
export function ConfirmDialog({
  triggerLabel, triggerAriaLabel, title, body, cancelLabel, children, triggerVariant = "danger",
}: {
  triggerLabel: string;
  triggerAriaLabel?: string; // must start with triggerLabel (WCAG 2.5.3)
  title: string;
  body: string;
  cancelLabel: string;
  children: ReactNode; // the form with the confirm button
  triggerVariant?: "danger" | "secondary";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId(), bodyId = useId();
  return (
    <>
      <Button ref={triggerRef} variant={triggerVariant} aria-label={triggerAriaLabel} onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClose={() => triggerRef.current?.focus()}
        className="m-auto max-h-[90dvh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border-2 border-line bg-surface p-6 text-fg"
      >
        <h2 id={titleId} className="mb-2 text-xl font-bold">{title}</h2>
        <p id={bodyId} className="mb-4">{body}</p>
        {children}
        <form method="dialog" className="mt-3">
          {/* Initial focus on the safe choice, not the destructive one. */}
          <Button type="submit" variant="secondary" className="w-full" autoFocus>{cancelLabel}</Button>
        </form>
      </dialog>
    </>
  );
}
