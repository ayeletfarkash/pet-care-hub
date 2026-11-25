"use client";

import { useActionState, useRef } from "react";
import { createInviteAction } from "@/app/actions/members";
import type { FormState } from "@/app/actions/form";
import type { Dict } from "@/i18n";
import { CheckboxField, SelectField } from "../ui/fields";
import { SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";
import { InviteShare } from "./invite-share";

/** One compact form: expiry, reusable. The new link shows with its share actions. */
export function InviteForm({ t, groupId, petName }: { t: Dict; groupId: string; petName: string }) {
  const [state, action] = useActionState(createInviteAction, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  const v = state.values ?? {};
  const i = t.invites;
  const link = state.ok ? state.data?.link : undefined;
  return (
    <form ref={ref} action={action} noValidate className="card rounded-xl border-2 border-divider bg-surface p-5">
      <FormStatus state={state} formRef={ref} />
      <input type="hidden" name="groupId" value={groupId} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <SelectField id="inv-expires" name="expiresInDays" label={i.expires} defaultValue={v.expiresInDays ?? "7"}
          options={["1", "3", "7", "14", "30"].map((d) => ({ value: d, label: d }))} />
      </div>
      <CheckboxField name="reusable" label={i.reusable} />
      <SubmitButton pendingLabel={t.common.saving}>{i.createLink}</SubmitButton>
      {link && (
        <div className="mt-4">
          <label htmlFor="new-link" className="block font-semibold">{i.linkLabel}</label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input id="new-link" readOnly value={link} dir="ltr" onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-lg border-2 border-line bg-surface px-3 font-mono text-sm" />
            <InviteShare t={t} link={link} petName={petName} />
          </div>
        </div>
      )}
    </form>
  );
}
