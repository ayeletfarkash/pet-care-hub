"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/app/actions/form";
import { SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";

/** One-button form for a server action, with its own accessible error/success message. */
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
  const [state, formAction] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className={className}>
      <FormStatus state={state} />
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <SubmitButton variant={variant} pendingLabel={pendingLabel} aria-label={ariaLabel}>{label}</SubmitButton>
    </form>
  );
}
