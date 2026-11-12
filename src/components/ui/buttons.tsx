"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Variant = "primary" | "secondary" | "danger" | "ghost";
// Min 44px target (WCAG 2.5.8 needs 24px; 44px is friendlier on touch).
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold text-base " +
  "border-2 transition-colors disabled:cursor-not-allowed aria-disabled:cursor-wait aria-disabled:opacity-70";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary border-primary hover:bg-primary-hover hover:border-primary-hover",
  secondary: "bg-surface text-fg border-line hover:bg-accent",
  danger: "bg-surface text-danger border-danger hover:bg-danger-bg",
  ghost: "bg-transparent text-fg border-transparent hover:bg-accent underline-offset-2",
};
export const buttonClass = (v: Variant = "primary", extra = "") => `${base} ${variants[v]} ${extra}`;

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" {...props} className={buttonClass(variant, className)} />;
}

/** Submit button that announces the pending state instead of silently disabling. */
export function SubmitButton({
  children, pendingLabel, variant = "primary", className = "", ...props
}: ComponentProps<"button"> & { pendingLabel: string; variant?: Variant; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...props}
      aria-disabled={pending || undefined}
      onClick={(e) => pending && e.preventDefault()}
      className={buttonClass(variant, className)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function LinkButton({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...props} className={`${buttonClass(variant, className)} no-underline hover:no-underline`} />;
}
