"use client";

import { useActionState, useRef } from "react";
import type { FormState } from "@/app/actions/form";

type Action = (s: FormState, fd: FormData) => Promise<FormState>;

/** Shared form wiring: action state, a ref for focus-on-error, echoed values and field errors. */
export function useForm(action: Action, initial: Record<string, unknown> = {}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  const v: Record<string, unknown> = state.values ?? initial;
  const e = state.fieldErrors ?? {};
  /** Props for a field: name, current value and its error. */
  const f = (name: string) => ({ name, defaultValue: (v[name] as string | number | null | undefined) ?? "", error: e[name] });
  /** Multi-value fields: echoed back comma-joined, or an array from `initial`. */
  const list = (name: string): string[] => {
    const x = v[name];
    return Array.isArray(x) ? x.map(String) : typeof x === "string" && x ? x.split(",") : [];
  };
  return { state, formAction, ref, v, e, f, list };
}
