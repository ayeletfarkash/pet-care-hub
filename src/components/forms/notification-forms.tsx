"use client";

import { useState } from "react";
import { NOTIFICATION_CATEGORIES, RECIPIENT_MODES } from "@/server/db/schema";
import { notificationPrefsAction, reminderRuleAction } from "@/app/actions/notifications";
import type { Dict } from "@/i18n";
import { SelectField } from "../ui/fields";
import { SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";
import { CheckboxGroup } from "./care-forms";
import { useForm } from "./use-form";

const LEADS = ["0", "15", "60", "1440"] as const; // matches REMINDER_LEADS in validation.ts

/** Personal notification categories (PRD §12.1). */
export function NotificationPrefsForm({ t, enabled }: { t: Dict; enabled: string[] }) {
  const { state, formAction, ref, list } = useForm(notificationPrefsAction, { categories: enabled });
  const k = t.notifications;
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <CheckboxGroup name="categories" idPrefix="categories" legendText={k.prefsLegend} checked={list("categories")}
        options={NOTIFICATION_CATEGORIES.map((c) => ({ value: c, label: k.categories[c] }))} />
      <SubmitButton pendingLabel={t.common.saving}>{k.savePrefs}</SubmitButton>
    </form>
  );
}

/** Lead time and recipients for one task/event/plan/routine (PRD §12.2). */
export function ReminderRuleForm({ t, hidden, initial, members }: {
  t: Dict;
  hidden: { groupId: string; sourceType: string; sourceId: string };
  initial: { leadMinutes: number; recipientMode: string; recipients: string[] };
  members: { userId: string; name: string }[];
}) {
  const { state, formAction, ref, f, list } = useForm(reminderRuleAction, { ...initial, leadMinutes: String(initial.leadMinutes) });
  const k = t.notifications.rule;
  const [mode, setMode] = useState(String(f("recipientMode").defaultValue));
  // change events bubble up from the recipient-mode select; members are only chosen in "selected" mode
  const onChange = (e: React.FormEvent<HTMLFormElement>) => { const el = e.target as unknown as HTMLSelectElement; if (el.name === "recipientMode") setMode(el.value); };
  return (
    <form ref={ref} action={formAction} noValidate onChange={onChange}>
      <FormStatus state={state} formRef={ref} />
      {Object.entries(hidden).map(([n, v]) => <input key={n} type="hidden" name={n} value={v} />)}
      <SelectField {...f("leadMinutes")} id="rule-lead" label={k.lead} options={LEADS.map((v) => ({ value: v, label: k.leads[v] }))} />
      <SelectField {...f("recipientMode")} id="rule-mode" label={k.who} hint={k.hint} options={RECIPIENT_MODES.map((m) => ({ value: m, label: k.modes[m] }))} />
      {mode === "selected" && <CheckboxGroup name="recipients" idPrefix="rule-recipients" legendText={k.recipients} checked={list("recipients")} error={state.fieldErrors?.recipients}
        options={members.map((m) => ({ value: m.userId, label: m.name }))} />}
      <SubmitButton variant="secondary" pendingLabel={t.common.saving}>{k.save}</SubmitButton>
    </form>
  );
}
