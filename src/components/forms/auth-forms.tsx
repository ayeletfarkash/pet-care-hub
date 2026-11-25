"use client";

import { useActionState, useRef } from "react";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "@/app/actions/auth";
import type { FormState } from "@/app/actions/form";
import type { Dict } from "@/i18n";
import { SelectField, TextField } from "../ui/fields";
import { SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";

export function LoginForm({ t }: { t: Dict }) {
  const [state, action] = useActionState(loginAction, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  const v = state.values ?? {}, e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} noValidate>
      <FormStatus state={state} formRef={ref} />
      <TextField name="email" type="email" dir="ltr" label={t.auth.email} autoComplete="email" inputMode="email"
        required requiredLabel={t.common.required} defaultValue={v.email} error={e.email} />
      <TextField name="password" type="password" dir="ltr" label={t.auth.password} autoComplete="current-password"
        required requiredLabel={t.common.required} error={e.password} />
      <SubmitButton pendingLabel={t.common.saving} className="w-full">{t.auth.loginButton}</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm({ t }: { t: Dict }) {
  const [state, action] = useActionState(forgotPasswordAction, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} noValidate>
      <FormStatus state={state} formRef={ref} />
      <TextField name="email" type="email" dir="ltr" label={t.auth.email} autoComplete="email" inputMode="email"
        required requiredLabel={t.common.required} defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <SubmitButton pendingLabel={t.common.saving} className="w-full">{t.auth.forgotButton}</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ t }: { t: Dict }) {
  const [state, action] = useActionState(resetPasswordAction, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} noValidate>
      <FormStatus state={state} formRef={ref} />
      <TextField name="password" type="password" dir="ltr" label={t.auth.newPassword} hint={t.auth.passwordHint}
        autoComplete="new-password" required requiredLabel={t.common.required} error={state.fieldErrors?.password} />
      <SubmitButton pendingLabel={t.common.saving} className="w-full">{t.auth.resetButton}</SubmitButton>
    </form>
  );
}

export function RegisterForm({ t, locale }: { t: Dict; locale: "he" | "en" }) {
  const [state, action] = useActionState(registerAction, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  const v = state.values ?? {}, e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} noValidate>
      <FormStatus state={state} formRef={ref} />
      <p className="mb-4 text-sm text-muted">{t.common.requiredLegend}</p>
      <TextField name="name" label={t.auth.name} autoComplete="name" required requiredLabel={t.common.required}
        defaultValue={v.name} error={e.name} />
      <TextField name="email" type="email" dir="ltr" label={t.auth.email} autoComplete="email" inputMode="email"
        required requiredLabel={t.common.required} defaultValue={v.email} error={e.email} />
      <TextField name="password" type="password" dir="ltr" label={t.auth.password} hint={t.auth.passwordHint}
        autoComplete="new-password" required requiredLabel={t.common.required} error={e.password} />
      <SelectField name="locale" label={t.auth.locale} defaultValue={v.locale ?? locale}
        options={[{ value: "he", label: "עברית", lang: "he" }, { value: "en", label: "English", lang: "en" }]} />
      <SubmitButton pendingLabel={t.common.saving} className="w-full">{t.auth.registerButton}</SubmitButton>
    </form>
  );
}
