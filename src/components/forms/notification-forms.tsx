"use client";

import { useEffect, useState } from "react";
import { NOTIFICATION_CATEGORIES, RECIPIENT_MODES } from "@/server/db/schema";
import { notificationPrefsAction, pushSubscribeAction, pushUnsubscribeAction, reminderRuleAction, snoozeAction } from "@/app/actions/notifications";
import type { Dict } from "@/i18n";
import { SelectField, TextField } from "../ui/fields";
import { Button, SubmitButton } from "../ui/buttons";
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

/** Snooze one notification (PRD §12.4–12.5). The time input only matters for "Choose a time". */
export function SnoozeForm({ t, id, label }: { t: Dict; id: string; label: string }) {
  const { state, formAction, ref, f } = useForm(snoozeAction);
  const k = t.notifications;
  const [option, setOption] = useState("15");
  return (
    <details className="w-full">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-link" aria-label={`${k.snooze}: ${label}`}>{k.snooze}</summary>
      <form ref={ref} action={formAction} noValidate className="mt-2 flex flex-wrap items-end gap-3"
        onChange={(e) => { const el = e.target as unknown as HTMLSelectElement; if (el.name === "option") setOption(el.value); }}>
        <div className="w-full"><FormStatus state={state} formRef={ref} /></div>
        <input type="hidden" name="id" value={id} />
        <SelectField id={`snooze-${id}`} name="option" label={k.snoozeFor} defaultValue={option} className="min-w-48"
          options={(["15", "60", "tomorrow", "custom"] as const).map((v) => ({ value: v, label: k.snoozeOptions[v] }))} />
        {option === "custom" && <TextField {...f("customAt")} id={`snooze-at-${id}`} type="datetime-local" label={k.snoozeAt} hint={k.snoozeAtHint} className="min-w-48" />}
        <SubmitButton variant="secondary" pendingLabel={t.common.saving} className="mb-4" aria-label={`${k.snooze}: ${label}`}>{k.snooze}</SubmitButton>
      </form>
    </details>
  );
}

const toKey = (b64: string) => {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
type PushState = "checking" | "on" | "off" | "denied" | "unsupported" | "unavailable" | "failed";

/** Turn Web Push on/off for this device (PRD §12.3). Permission is only requested after a button press. */
export function PushSettings({ t, publicKey }: { t: Dict; publicKey: string | null }) {
  const k = t.notifications.push;
  const [status, setStatus] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Browser-only checks, so they run after hydration.
    const check = async (): Promise<PushState> => {
      if (!publicKey) return "unavailable";
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription().catch(() => null);
      return sub ? "on" : "off";
    };
    check().then(setStatus, () => setStatus("off"));
  }, [publicKey]);

  async function enable() {
    if (busy) return;
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setStatus("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey!) });
      const res = await pushSubscribeAction(sub.toJSON());
      if (!res.ok) { await sub.unsubscribe(); return setStatus("failed"); }
      setStatus("on");
    } catch { setStatus("failed"); } finally { setBusy(false); }
  }
  async function disable() {
    if (busy) return;
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (sub) { await pushUnsubscribeAction(sub.endpoint); await sub.unsubscribe(); }
      setStatus("off");
    } catch { setStatus("failed"); } finally { setBusy(false); }
  }

  const message = k[status];
  const canToggle = status === "on" || status === "off" || status === "failed";
  return (
    <div>
      <p className="mb-2">{k.intro}</p>
      <p className="mb-3 text-sm text-muted">{k.ios}</p>
      <p role="status" className="mb-3 font-semibold">{message}</p>
      {/* One button whose label flips, so keyboard focus stays on it (aria-disabled keeps it focusable while busy). */}
      {canToggle && (
        <Button type="button" variant={status === "on" ? "secondary" : "primary"} onClick={status === "on" ? disable : enable} aria-disabled={busy || undefined}>
          {status === "on" ? k.disable : k.enable}
        </Button>
      )}
    </div>
  );
}
