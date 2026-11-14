"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { FormState } from "@/app/actions/form";

/**
 * Error/success message for a form. Errors use role="alert"; success uses role="status".
 * On a failed submit, focus moves to the first invalid field (or the message) so keyboard and
 * screen-reader users land where the problem is (WCAG 3.3.1).
 */
export function FormStatus({ state, formRef }: { state: FormState; formRef?: RefObject<HTMLFormElement | null> }) {
  const msgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state.error) return;
    const firstInvalid = formRef?.current?.querySelector<HTMLElement>("[aria-invalid='true']");
    (firstInvalid ?? msgRef.current)?.focus();
  }, [state, formRef]);

  if (state.error)
    return (
      <div ref={msgRef} tabIndex={-1} role="alert" className="mb-4 rounded-lg border-2 border-danger bg-danger-bg p-3 font-semibold text-danger">
        <span aria-hidden="true">⚠ </span>
        {state.error}
      </div>
    );
  if (state.ok && state.message)
    return (
      <div role="status" className="mb-4 rounded-lg border-2 border-success bg-success-bg p-3 font-semibold text-success">
        <span aria-hidden="true">✓ </span>
        {state.message}
      </div>
    );
  return <div role="status" className="sr-only" />;
}
