"use client";

import { useActionState, useRef, type ReactNode } from "react";
import type { FormState } from "@/app/actions/form";
import { SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";
import { announce } from "../live-region";

/**
 * Where focus should go if this action removes its own button (e.g. completing a task removes the
 * row): the next list item, else the previous one, else the section's heading (WCAG 2.4.3).
 */
export function focusTargetFor(form: HTMLFormElement): () => HTMLElement | null {
  const li = form.closest("li");
  const sibling = li?.nextElementSibling ?? li?.previousElementSibling ?? null;
  const heading = form.closest("section")?.querySelector<HTMLElement>("h1, h2, h3") ?? document.querySelector<HTMLElement>("main h1");
  return () => {
    const inSibling = sibling?.isConnected ? sibling.querySelector<HTMLElement>("a[href], button") : null;
    if (inSibling) return inSibling;
    if (heading?.isConnected) { heading.tabIndex = -1; return heading; }
    return null;
  };
}

/**
 * One-button form for a server action. Errors show inline (the form stays). Success is announced
 * through the app-wide live region, because the action often removes this very button.
 */
export function ActionForm({
  action, fields, label, ariaLabel, pendingLabel, variant = "secondary", className = "", children,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: string;
  ariaLabel?: string; // must start with `label` (WCAG 2.5.3); adds context, e.g. the member's name
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  children?: ReactNode; // extra inputs (e.g. a confirm field)
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(async (prev: FormState, fd: FormData) => {
    const fallback = formRef.current ? focusTargetFor(formRef.current) : null;
    const result = await action(prev, fd);
    if (result.ok && result.message) announce(result.message); // runs even if this form unmounts
    if (result.ok && fallback) {
      // After the refreshed page renders: if our button is gone, move focus somewhere sensible.
      setTimeout(() => { if (!formRef.current?.isConnected) fallback()?.focus(); }, 150);
    }
    return result;
  }, {} as FormState);
  return (
    <form ref={formRef} action={formAction} className={className}>
      <FormStatus state={state.error ? state : {}} />
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <SubmitButton variant={variant} pendingLabel={pendingLabel} aria-label={ariaLabel}>{label}</SubmitButton>
    </form>
  );
}
