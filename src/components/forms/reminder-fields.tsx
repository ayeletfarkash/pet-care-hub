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

/** Says up front when this reminder can't reach this device: push unsupported/blocked, or the category is off. */
export function ReminderAvailability({ t, prefsOff }: { t: Dict; prefsOff?: boolean }) {
  const push = useSyncExternalStore(noSubscribe, pushSupport, () => "ok" as const); // browser-only check
  const messages = [prefsOff ? t.notifications.rule.prefsOff : null, push === "ok" ? null : t.notifications.push[push]].filter((m): m is string => !!m);
  if (messages.length === 0) return null;
  return (
    <div className="mb-4 rounded-lg border-2 border-line bg-surface p-3 text-sm">
      {messages.map((m) => <p key={m}>{m}</p>)}
    </div>
  );
}

/** "When to remind": preset lead times, plus a custom date-time when `allowCustom` (tasks). */
export function ReminderChoice({ t, name, id, label, defaultValue, remindAt, allowCustom, errors }: {
  t: Dict; name: string; id: string; label: string; defaultValue: string; remindAt?: string | null; allowCustom: boolean;
  errors?: { lead?: string; remindAt?: string };
}) {
  const k = t.notifications.rule;
  const [lead, setLead] = useState(defaultValue);
  // After a failed submit the form echoes the choice back and React resets the form to defaults:
  // remount the select with the echoed value (key) and follow it here, so select and date field agree.
  const [echoed, setEchoed] = useState(defaultValue);
  if (defaultValue !== echoed) { setEchoed(defaultValue); setLead(defaultValue); }
  const options = [...LEADS.map((v) => ({ value: v, label: k.leads[v] })), ...(allowCustom ? [{ value: "custom", label: k.custom }] : [])];
  return (
    <div>
      <SelectField key={defaultValue} id={id} name={name} label={label} defaultValue={lead} onChange={setLead} error={errors?.lead} options={options} />
      {lead === "custom" && (
        <TextField id={`${id}-at`} name="remindAt" type="datetime-local" label={k.remindAt} defaultValue={remindAt ?? ""} error={errors?.remindAt} />
      )}
    </div>
  );
}
