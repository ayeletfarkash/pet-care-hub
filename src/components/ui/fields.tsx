import type { ReactNode } from "react";

type Base = {
  name: string;
  id?: string; // defaults to name; set it when the same field name appears twice on a page
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  requiredLabel?: string;
  defaultValue?: string | number | null;
  className?: string;
};

const inputCls =
  "mt-1 block w-full rounded-lg border-2 border-line bg-surface px-3 py-2.5 text-base text-fg min-h-11 " +
  "aria-[invalid=true]:border-danger disabled:opacity-60";

/** Label + control + hint + error, all programmatically associated (WCAG 1.3.1, 3.3.1, 3.3.2). */
function FieldShell({ name, id, label, hint, error, required, requiredLabel, children, className }: Base & { children: ReactNode }) {
  const fid = id ?? name;
  return (
    <div className={className ?? "mb-4"}>
      <label htmlFor={fid} className="block font-semibold">
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true"> *</span>
        )}
        {required && requiredLabel && <span className="sr-only"> ({requiredLabel})</span>}
      </label>
      {hint && (
        <p id={`${fid}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${fid}-error`} className="mt-1 text-sm font-semibold text-danger">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (name: string, hint?: string, error?: string) =>
  [hint && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(" ") || undefined;

export function TextField(
  props: Base & {
    type?: "text" | "email" | "password" | "date" | "time" | "number" | "tel";
    autoComplete?: string;
    dir?: "ltr" | "rtl" | "auto";
    step?: string;
    min?: string;
    max?: string;
    inputMode?: "decimal" | "numeric" | "tel" | "email";
    readOnly?: boolean;
  },
) {
  const fid = props.id ?? props.name;
  const { name, type = "text", hint, error, required, defaultValue, autoComplete, dir, step, min, max, inputMode, readOnly } = props;
  return (
    <FieldShell {...props}>
      <input
        id={fid}
        name={name}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, hint, error)}
        defaultValue={defaultValue ?? undefined}
        autoComplete={autoComplete}
        dir={dir}
        step={step}
        min={min}
        max={max}
        inputMode={inputMode}
        readOnly={readOnly}
        className={inputCls}
      />
    </FieldShell>
  );
}

export function TextareaField(props: Base & { rows?: number }) {
  const fid = props.id ?? props.name;
  const { name, hint, error, required, defaultValue, rows = 3 } = props;
  return (
    <FieldShell {...props}>
      <textarea
        id={fid}
        name={name}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, hint, error)}
        defaultValue={defaultValue ?? undefined}
        className={inputCls}
      />
    </FieldShell>
  );
}

export function SelectField(props: Base & { options: { value: string; label: string; lang?: string }[] }) {
  const fid = props.id ?? props.name;
  const { name, hint, error, required, defaultValue, options } = props;
  return (
    <FieldShell {...props}>
      <select
        id={fid}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, hint, error)}
        defaultValue={defaultValue ?? undefined}
        className={inputCls}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} lang={o.lang}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className="mt-1 size-6 shrink-0 accent-primary"
      />
      <div>
        <label htmlFor={name} className="font-semibold">
          {label}
        </label>
        {hint && <p id={`${name}-hint`} className="text-sm text-muted">{hint}</p>}
      </div>
    </div>
  );
}
