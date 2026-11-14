"use client";

import { useActionState, useRef, useState } from "react";
import { createInviteAction } from "@/app/actions/members";
import type { FormState } from "@/app/actions/form";
import type { Dict } from "@/i18n";
import { CheckboxField, SelectField, TextField } from "../ui/fields";
// Both invite forms live on one page, so their fields get prefixed ids (names stay the same).
import { Button, SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";

function CreatedLink({ t, link }: { t: Dict; link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-4">
      <label htmlFor="new-link" className="block font-semibold">{t.invites.linkLabel}</label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input id="new-link" readOnly value={link} dir="ltr" onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-lg border-2 border-line bg-surface px-3 font-mono text-sm" />
        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>{t.invites.copy}</Button>
      </div>
      <p role="status" className="mt-1 text-sm text-success">{copied ? t.invites.copied : ""}</p>
    </div>
  );
}

function InviteForm({ t, groupId, byEmail }: { t: Dict; groupId: string; byEmail: boolean }) {
  const [state, action] = useActionState(createInviteAction, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  const e = state.fieldErrors ?? {}, v = state.values ?? {};
  const prefix = byEmail ? "em" : "ln";
  const i = t.invites;
  return (
    <form ref={ref} action={action} noValidate className="card rounded-xl border-2 border-divider bg-surface p-5">
      <h3 className="mb-3 text-lg font-bold">{byEmail ? i.emailTitle : i.linkTitle}</h3>
      <FormStatus state={state} formRef={ref} />
      {state.ok && state.data?.link && <CreatedLink t={t} link={state.data.link} />}
      <input type="hidden" name="groupId" value={groupId} />
      {/* Unique ids per form: both forms live on one page. Names stay the same for the action. */}
      <div className="grid gap-x-4 sm:grid-cols-2">
        {byEmail && (
          <TextField id={`${prefix}-email`} name="email" type="email" dir="ltr" autoComplete="off" label={i.email}
            required requiredLabel={t.common.required} defaultValue={v.email} error={e.email} className="mb-4 sm:col-span-2" />
        )}
        <SelectField id={`${prefix}-role`} name="role" label={i.role} defaultValue={v.role ?? "caregiver"}
          options={[{ value: "caregiver", label: t.roles.caregiver }, { value: "admin", label: t.roles.admin }]} />
        <SelectField id={`${prefix}-expires`} name="expiresInDays" label={i.expires} defaultValue={v.expiresInDays ?? "7"}
          options={["1", "3", "7", "14", "30"].map((d) => ({ value: d, label: d }))} />
      </div>
      {!byEmail && <CheckboxField name="reusable" label={i.reusable} />}
      <SubmitButton pendingLabel={t.common.saving}>{byEmail ? i.sendEmail : i.createLink}</SubmitButton>
    </form>
  );
}

export function InviteForms({ t, groupId }: { t: Dict; groupId: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InviteForm t={t} groupId={groupId} byEmail={false} />
      <InviteForm t={t} groupId={groupId} byEmail />
    </div>
  );
}
