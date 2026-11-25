"use client";

import { useState, useSyncExternalStore } from "react";
import type { Dict } from "@/i18n";
import { SelectField, TextField } from "../ui/fields";

const LEADS = ["0", "15", "60", "1440"] as const; // matches REMINDER_LEADS in validation.ts

type PushSupport = "ok" | "unsupported" | "denied";
const pushSupport = (): PushSupport =>
  !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) ? "unsupported"
    : Notification.permission === "denied" ? "denied" : "ok";
const noSubscribe = () => () => {};

/**
 * "When to remind": preset lead times, plus a custom date-time when `allowCustom` (tasks). The hint says
 * when the reminder can't reach this device: push unsupported/blocked, or the category is off.
 */
export function ReminderChoice({ t, name, id, label, defaultValue, remindAt, allowCustom, prefsOff, errors }: {
  t: Dict; name: string; id: string; label: string; defaultValue: string; remindAt?: string | null; allowCustom: boolean; prefsOff: boolean;
  errors?: { lead?: string; remindAt?: string };
}) {
  const k = t.notifications.rule;
  const push = useSyncExternalStore(noSubscribe, pushSupport, () => "ok" as const); // browser-only check
  const hint = [prefsOff && k.prefsOff, push !== "ok" && t.notifications.push[push]].filter(Boolean).join(" ") || undefined;
  const [lead, setLead] = useState(defaultValue);
  // The select goes back to a new default (echoed or saved value): follow it, so select and date field agree.
  const [echoed, setEchoed] = useState(defaultValue);
  if (defaultValue !== echoed) { setEchoed(defaultValue); setLead(defaultValue); }
  const options = [...LEADS.map((v) => ({ value: v, label: k.leads[v] })), ...(allowCustom ? [{ value: "custom", label: k.custom }] : [])];
  return (
    <div>
      <SelectField id={id} name={name} label={label} hint={hint} defaultValue={defaultValue} onChange={setLead} error={errors?.lead} options={options} />
      {lead === "custom" && (
        <TextField id={`${id}-at`} name="remindAt" type="datetime-local" dir="ltr" label={k.remindAt} defaultValue={remindAt ?? ""} error={errors?.remindAt} />
      )}
    </div>
  );
}
