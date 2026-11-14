"use client";

import { useActionState, useRef } from "react";
import { updateProfileAction } from "@/app/actions/preferences";
import type { FormState } from "@/app/actions/form";
import type { Dict } from "@/i18n";
import { SelectField, TextField } from "../ui/fields";
import { SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";

export function ProfileForm({ t, name, email, locale }: { t: Dict; name: string; email: string; locale: "he" | "en" }) {
  const [state, action] = useActionState(updateProfileAction, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  const v = state.values ?? {}, e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} noValidate>
      <FormStatus state={state} formRef={ref} />
      <TextField name="name" label={t.auth.name} autoComplete="name" required requiredLabel={t.common.required}
        defaultValue={v.name ?? name} error={e.name} />
      <TextField name="email" type="email" dir="ltr" label={t.auth.email} hint={t.profile.emailNote} defaultValue={email} readOnly />
      <SelectField name="locale" label={t.auth.locale} defaultValue={v.locale ?? locale}
        options={[{ value: "he", label: "עברית", lang: "he" }, { value: "en", label: "English", lang: "en" }]} />
      <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
    </form>
  );
}
