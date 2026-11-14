import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ZodType } from "zod";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n/server";

export type FormState = {
  ok?: boolean;
  message?: string; // localized success message
  error?: string; // localized form-level error
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>; // echoed back so inputs keep their content after an error
  data?: Record<string, string>; // extra payload, e.g. a freshly created invite link
};

const NEVER_ECHO = new Set(["password", "photo", "confirmName", "files"]);
/** Fields submitted as several inputs with the same name (checkbox groups, repeated time inputs). */
const MULTI_VALUE = ["times", "weekdays", "assignees", "categories", "recipients"];

function echo(fd: FormData) {
  const values: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !NEVER_ECHO.has(k) && !k.startsWith("$")) values[k] = v;
  for (const k of MULTI_VALUE) if (fd.has(k)) values[k] = fd.getAll(k).filter((v) => typeof v === "string").join(","); // read back with split(",")
  return values;
}

/** Validate FormData with zod, run `fn`, and turn failures into localized form state. */
export async function handleForm<T>(
  fd: FormData,
  schema: ZodType<T>,
  fn: (input: T) => Promise<FormState | void>,
): Promise<FormState> {
  const { t } = await getT();
  const input: Record<string, unknown> = Object.fromEntries(fd.entries());
  for (const k of MULTI_VALUE) if (fd.has(k)) input[k] = fd.getAll(k).filter((v) => typeof v === "string" && v !== "");
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= t.validation[issue.message as keyof typeof t.validation] ?? t.validation.required;
    }
    return { error: t.errors.invalid_input, fieldErrors, values: echo(fd) };
  }
  try {
    return (await fn(parsed.data)) ?? { ok: true, message: t.common.saved };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof AppError) return { error: t.errors[e.code], values: echo(fd) };
    console.error(e);
    return { error: t.errors.generic, values: echo(fd) };
  }
}

/** For actions without a zod schema (buttons with ids). */
export async function handleAction(fn: () => Promise<FormState | void>): Promise<FormState> {
  return handleForm(new FormData(), { safeParse: () => ({ success: true, data: undefined }) } as unknown as ZodType<undefined>, fn);
}
