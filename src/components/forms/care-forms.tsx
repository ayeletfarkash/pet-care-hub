"use client";

import { useEffect, useState, type RefObject } from "react";
import type { FormState } from "@/app/actions/form";
import { EVENT_TYPES, INVENTORY_TYPES, MEDICAL_TYPES, MOVEMENT_KINDS, ORDER_STATUSES, RECURRENCES, SCHEDULE_TYPES, TASK_PRIORITIES, TASK_RECURRENCES } from "@/server/db/schema";
import { fmt, type Dict } from "@/i18n";
import { CheckboxField, SelectField, TextareaField, TextField } from "../ui/fields";
import { SubmitButton } from "../ui/buttons";
import { FormStatus } from "../ui/form-status";
import { useForm } from "./use-form";

type Action = (s: FormState, fd: FormData) => Promise<FormState>;
type Member = { userId: string; name: string };
const card = "card mb-6 rounded-xl border-2 border-divider bg-surface p-5";
const legend = "px-1 text-xl font-bold";

function Hidden({ fields }: { fields: Record<string, string> }) {
  return <>{Object.entries(fields).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}</>;
}

/** Checkbox group with a real fieldset/legend and an associated error (WCAG 1.3.1, 3.3.1). */
export function CheckboxGroup({ name, legendText, options, checked, error, idPrefix }: {
  name: string; legendText: string; options: { value: string; label: string }[]; checked: string[]; error?: string; idPrefix: string;
}) {
  return (
    <fieldset className="mb-4" aria-describedby={error ? `${idPrefix}-error` : undefined}>
      <legend className="font-semibold">{legendText}</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="inline-flex min-h-11 cursor-pointer items-center gap-2">
            <input type="checkbox" name={name} value={o.value} defaultChecked={checked.includes(o.value)} className="size-6 accent-primary" />
            {o.label}
          </label>
        ))}
      </div>
      {error && <p id={`${idPrefix}-error`} className="mt-1 text-sm font-semibold text-danger"><span aria-hidden="true">⚠ </span>{error}</p>}
    </fieldset>
  );
}

/** Clear the form after each successful submit (each result is a new state object). */
function useResetOnSuccess(state: FormState, ref: RefObject<HTMLFormElement | null>) {
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state, ref]);
}

const memberOptions = (t: Dict, members: Member[]) => [{ value: "", label: t.ui.nobody }, ...members.map((m) => ({ value: m.userId, label: m.name }))];

// ─────────── Medical ───────────
export function MedicalForm({ t, action, hidden, initial, submitLabel, withFiles, today }: {
  t: Dict; action: Action; hidden: Record<string, string>; initial?: Record<string, unknown>; submitLabel: string; withFiles?: boolean; today: string;
}) {
  const { state, formAction, ref, f } = useForm(action, initial ?? { date: today });
  const m = t.medical, req = t.common.required;
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <p className="mb-4 text-sm text-muted">{t.common.requiredLegend}</p>
      <div className={card}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <SelectField {...f("type")} label={m.type} required requiredLabel={req}
            options={[{ value: "", label: t.common.choose }, ...MEDICAL_TYPES.map((x) => ({ value: x, label: m.types[x] }))]} />
          <TextField {...f("date")} type="date" max={today} label={m.date} required requiredLabel={req} />
        </div>
        <TextField {...f("title")} label={m.titleField} required requiredLabel={req} />
        <TextField {...f("provider")} label={m.provider} />
        <TextareaField {...f("description")} label={m.description} />
        <TextareaField {...f("details")} label={m.details} hint={m.detailsHint} />
        <TextareaField {...f("notes")} label={t.ui.notes} />
        {withFiles && <FileInput t={t} />}
      </div>
      <SubmitButton pendingLabel={t.common.saving}>{submitLabel}</SubmitButton>
    </form>
  );
}

function FileInput({ t }: { t: Dict }) {
  return (
    <div className="mb-4">
      <label htmlFor="files" className="block font-semibold">{t.medical.files}</label>
      <p id="files-hint" className="text-sm text-muted">{t.medical.filesHint}</p>
      <input id="files" name="files" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" aria-describedby="files-hint"
        className="mt-1 block w-full rounded-lg border-2 border-line p-2 file:me-3 file:min-h-10 file:rounded-md file:border-0 file:bg-accent file:px-3 file:font-semibold" />
    </div>
  );
}

export function DocumentsForm({ t, action, hidden }: { t: Dict; action: Action; hidden: Record<string, string> }) {
  const { state, formAction, ref } = useForm(action);
  useResetOnSuccess(state, ref);
  return (
    <form ref={ref} action={formAction}>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <FileInput t={t} />
      <SubmitButton variant="secondary" pendingLabel={t.common.saving}>{t.medical.upload}</SubmitButton>
    </form>
  );
}

// ─────────── Medication plans ───────────
export function PlanForm({ t, action, hidden, initial, members, submitLabel, today }: {
  t: Dict; action: Action; hidden: Record<string, string>; initial?: Record<string, unknown>; members: Member[]; submitLabel: string; today: string;
}) {
  const form = useForm(action, initial ?? { scheduleType: "daily", startDate: today, times: ["08:00"] });
  const { state, formAction, ref, f } = form;
  const m = t.meds, req = t.common.required;
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <p role="note" className="mb-4 rounded-lg border-2 border-line bg-accent p-3 text-sm">{m.disclaimer}</p>
      <p className="mb-4 text-sm text-muted">{t.common.requiredLegend}</p>
      <div className={card}>
        <TextField {...f("name")} label={m.name} required requiredLabel={req} />
        <TextField {...f("dosage")} label={m.dosage} hint={m.dosageHint} required requiredLabel={req} />
        <TextareaField {...f("instructions")} label={m.instructions} />
        <SelectField {...f("responsibleUserId")} label={m.responsible} options={memberOptions(t, members)} />
      </div>
      <ScheduleFields t={t} form={form} labels={{ legend: m.schedule, times: m.times, timesHint: m.timesHint, time: m.time }} />
      <div className={card}><TextareaField {...f("notes")} label={t.ui.notes} /></div>
      <SubmitButton pendingLabel={t.common.saving}>{submitLabel}</SubmitButton>
    </form>
  );
}

/** Schedule fieldset shared by medication plans and routines (same rules, see validation.ts). */
function ScheduleFields({ t, form, labels }: { t: Dict; form: ReturnType<typeof useForm>; labels: { legend: string; times: string; timesHint: string; time: string } }) {
  const { f, list, v, e } = form;
  const [type, setType] = useState(String(v.scheduleType ?? "daily"));
  const m = t.meds, req = t.common.required;
  const times = list("times");
  return (
    <fieldset className={card}>
      <legend className={legend}>{labels.legend}</legend>
      <div onChange={(ev) => { const el = ev.target as HTMLElement; if (el.getAttribute("name") === "scheduleType") setType((el as HTMLSelectElement).value); }}>
        <SelectField {...f("scheduleType")} label={m.scheduleType} required requiredLabel={req}
          options={SCHEDULE_TYPES.map((x) => ({ value: x, label: m.scheduleTypes[x] }))} />
      </div>
      {type === "weekdays" && (
        <CheckboxGroup name="weekdays" idPrefix="weekdays" legendText={m.weekdaysLabel} checked={list("weekdays")} error={e.weekdays}
          options={t.weekdays.long.map((d, i) => ({ value: String(i), label: d }))} />
      )}
      {type === "interval" && <TextField {...f("intervalDays")} type="number" min="1" max="365" inputMode="numeric" label={m.intervalDays} required requiredLabel={req} />}
      <fieldset className="mb-4" aria-describedby={`times-hint${e.times ? " times-error" : ""}`}>
        <legend className="font-semibold">{labels.times}<span className="text-danger" aria-hidden="true"> *</span><span className="sr-only"> ({req})</span></legend>
        <p id="times-hint" className="text-sm text-muted">{labels.timesHint}</p>
        <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i}>
              <label htmlFor={`times-${i}`} className="block text-sm">{fmt(labels.time, { n: i + 1 })}</label>
              <input id={`times-${i}`} name="times" type="time" defaultValue={times[i] ?? ""} aria-invalid={e.times && i === 0 ? true : undefined}
                className="mt-1 block min-h-11 w-full rounded-lg border-2 border-line bg-surface px-3 aria-[invalid=true]:border-danger" />
            </div>
          ))}
        </div>
        {e.times && <p id="times-error" className="mt-1 text-sm font-semibold text-danger"><span aria-hidden="true">⚠ </span>{e.times}</p>}
      </fieldset>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <TextField {...f("startDate")} type="date" label={m.startDate} required requiredLabel={req} />
        <TextField {...f("endDate")} type="date" label={m.endDate} hint={m.endDateHint} />
      </div>
    </fieldset>
  );
}

// ─────────── Events ───────────
export function EventForm({ t, action, hidden, initial, members, submitLabel, today }: {
  t: Dict; action: Action; hidden: Record<string, string>; initial?: Record<string, unknown>; members: Member[]; submitLabel: string; today: string;
}) {
  const { state, formAction, ref, f, v } = useForm(action, initial ?? { date: today, recurrence: "none" });
  const [rec, setRec] = useState(String(v.recurrence ?? "none"));
  const ev = t.events, req = t.common.required;
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <p className="mb-4 text-sm text-muted">{t.common.requiredLegend}</p>
      <div className={card}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <SelectField {...f("type")} label={ev.type} required requiredLabel={req}
            options={[{ value: "", label: t.common.choose }, ...EVENT_TYPES.map((x) => ({ value: x, label: ev.types[x] }))]} />
          <TextField {...f("title")} label={ev.titleField} required requiredLabel={req} />
          <TextField {...f("date")} type="date" label={ev.date} required requiredLabel={req} />
          <TextField {...f("time")} type="time" label={ev.time} hint={ev.timeHint} />
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField {...f("location")} label={ev.location} />
          <TextField {...f("provider")} label={ev.provider} />
        </div>
        <SelectField {...f("assigneeId")} label={ev.assignee} options={memberOptions(t, members)} />
        <TextareaField {...f("description")} label={ev.description} />
        <TextareaField {...f("notes")} label={t.ui.notes} />
      </div>
      <fieldset className={card}>
        <legend className={legend}>{ev.recurrenceSection}</legend>
        <div className="grid gap-x-4 sm:grid-cols-2" onChange={(x) => { const el = x.target as HTMLElement; if (el.getAttribute("name") === "recurrence") setRec((el as HTMLSelectElement).value); }}>
          <SelectField {...f("recurrence")} label={ev.recurrence} options={RECURRENCES.map((x) => ({ value: x, label: ev.recurrences[x] }))} />
          {rec !== "none" && <TextField {...f("recurrenceUntil")} type="date" label={ev.until} hint={ev.untilHint} />}
        </div>
        {hidden.eventId && <p className="text-sm text-muted">{ev.recurringNote}</p>}
      </fieldset>
      <SubmitButton pendingLabel={t.common.saving}>{submitLabel}</SubmitButton>
    </form>
  );
}

// ─────────── Tasks ───────────
export function TaskForm({ t, action, hidden, initial, members, submitLabel }: {
  t: Dict; action: Action; hidden: Record<string, string>; initial?: Record<string, unknown>; members: Member[]; submitLabel: string;
}) {
  const { state, formAction, ref, f, list, e, v } = useForm(action, initial ?? { priority: "normal", recurrence: "none", recurrenceInterval: 1 });
  const [rec, setRec] = useState(String(v.recurrence ?? "none") as (typeof TASK_RECURRENCES)[number]);
  const k = t.tasks, req = t.common.required;
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <p className="mb-4 text-sm text-muted">{t.common.requiredLegend}</p>
      <div className={card}>
        <TextField {...f("title")} label={k.titleField} required requiredLabel={req} />
        <TextareaField {...f("description")} label={k.description} />
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField {...f("dueDate")} type="date" label={k.dueDate} />
          <TextField {...f("dueTime")} type="time" label={k.dueTime} hint={k.dueTimeHint} />
          <SelectField {...f("priority")} label={k.priority} options={TASK_PRIORITIES.map((x) => ({ value: x, label: k.priorities[x] }))} />
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2"
          onChange={(x) => { const el = x.target as HTMLElement; if (el.getAttribute("name") === "recurrence") setRec((el as HTMLSelectElement).value as typeof rec); }}>
          <SelectField {...f("recurrence")} label={k.recurrence} hint={k.recurrenceHint} options={TASK_RECURRENCES.map((x) => ({ value: x, label: k.repeatUnits[x] }))} />
          {rec !== "none" && (
            <TextField {...f("recurrenceInterval")} type="number" min="1" max="365" inputMode="numeric" label={k.interval[rec]} hint={k.intervalHint} />
          )}
        </div>
        {members.length > 0 && (
          <CheckboxGroup name="assignees" idPrefix="assignees" legendText={k.assignees} checked={list("assignees")} error={e.assignees}
            options={members.map((m) => ({ value: m.userId, label: m.name }))} />
        )}
      </div>
      <SubmitButton pendingLabel={t.common.saving}>{submitLabel}</SubmitButton>
    </form>
  );
}

export function CommentForm({ t, action, hidden }: { t: Dict; action: Action; hidden: Record<string, string> }) {
  const { state, formAction, ref, e } = useForm(action);
  useResetOnSuccess(state, ref);
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <TextareaField name="body" label={t.tasks.comment} required requiredLabel={t.common.required} error={e.body} />
      <SubmitButton variant="secondary" pendingLabel={t.common.saving}>{t.tasks.addComment}</SubmitButton>
    </form>
  );
}

export function TransferForm({ t, action, hidden, members, isAdmin }: { t: Dict; action: Action; hidden: Record<string, string>; members: Member[]; isAdmin: boolean }) {
  const { state, formAction, ref } = useForm(action);
  return (
    <form ref={ref} action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="w-full"><FormStatus state={state} formRef={ref} /></div>
      <Hidden fields={hidden} />
      <SelectField id="transfer-to" name="toUserId" label={t.tasks.transferTo} className="min-w-48 flex-1"
        options={members.map((m) => ({ value: m.userId, label: m.name }))} />
      <SubmitButton variant="secondary" pendingLabel={t.common.saving} className="mb-0">{isAdmin ? t.tasks.transferApply : t.tasks.transferRequest}</SubmitButton>
    </form>
  );
}

// ─────────── Inventory ───────────
type Opt = { value: string; label: string };
const decimal = { type: "number", min: "0", step: "any", inputMode: "decimal" } as const;

export function InventoryItemForm({ t, action, hidden, initial, plans, submitLabel }: {
  t: Dict; action: Action; hidden: Record<string, string>; initial?: Record<string, unknown>; plans: Opt[]; submitLabel: string;
}) {
  const { state, formAction, ref, f } = useForm(action, initial ?? { quantity: 0 });
  const k = t.inventory, req = t.common.required;
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <p className="mb-4 text-sm text-muted">{t.common.requiredLegend}</p>
      <div className={card}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField {...f("name")} label={k.name} required requiredLabel={req} />
          <TextField {...f("brand")} label={k.brand} />
          <SelectField {...f("type")} label={k.type} required requiredLabel={req}
            options={[{ value: "", label: t.common.choose }, ...INVENTORY_TYPES.map((x) => ({ value: x, label: k.types[x] }))]} />
          <TextField {...f("unit")} label={k.unit} hint={k.unitHint} />
        </div>
        {plans.length > 0 && <SelectField {...f("medicationPlanId")} label={k.plan} options={[{ value: "", label: k.noPlan }, ...plans]} />}
      </div>
      <fieldset className={card}>
        <legend className={legend}>{k.stockSection}</legend>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField {...f("quantity")} {...decimal} label={k.quantity} />
          <TextField {...f("packageSize")} {...decimal} label={k.packageSize} />
          <TextField {...f("dailyUsage")} {...decimal} label={k.dailyUsage} hint={k.dailyUsageHint} />
          <TextField {...f("lowStockThreshold")} {...decimal} label={k.threshold} hint={k.thresholdHint} />
        </div>
      </fieldset>
      <div className={card}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField {...f("vendor")} label={k.vendor} />
          <TextField {...f("price")} {...decimal} label={k.price} />
          <TextField {...f("purchaseDate")} type="date" label={k.purchaseDate} />
        </div>
        <TextareaField {...f("notes")} label={t.ui.notes} />
      </div>
      <SubmitButton pendingLabel={t.common.saving}>{submitLabel}</SubmitButton>
    </form>
  );
}

/** Both roles: record use, a purchase, a counted quantity, or that it ran out. */
export function StockForm({ t, action, hidden }: { t: Dict; action: Action; hidden: Record<string, string> }) {
  const { state, formAction, ref, f } = useForm(action, { kind: "consumption" });
  useResetOnSuccess(state, ref);
  const k = t.inventory;
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <SelectField {...f("kind")} label={k.kind} options={MOVEMENT_KINDS.map((x) => ({ value: x, label: k.kinds[x] }))} />
        <TextField {...f("amount")} {...decimal} label={k.amount} hint={k.amountHint} />
      </div>
      <TextField {...f("note")} label={k.note} />
      <SubmitButton variant="secondary" pendingLabel={t.common.saving}>{k.saveStock}</SubmitButton>
    </form>
  );
}

// ─────────── Orders ───────────
export function OrderForm({ t, action, hidden, initial, items, submitLabel, today, withStatus }: {
  t: Dict; action: Action; hidden: Record<string, string>; initial?: Record<string, unknown>; items: Opt[]; submitLabel: string; today: string; withStatus?: boolean;
}) {
  const { state, formAction, ref, f } = useForm(action, initial ?? { orderDate: today, status: "ordered" });
  const o = t.orders, req = t.common.required;
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <p className="mb-4 text-sm text-muted">{t.common.requiredLegend}</p>
      <div className={card}>
        <TextField {...f("product")} label={o.product} required requiredLabel={req} />
        {items.length > 0 && <SelectField {...f("itemId")} label={o.item} hint={o.itemHint} options={[{ value: "", label: o.noItem }, ...items]} />}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField {...f("quantity")} {...decimal} label={o.quantity} hint={o.quantityHint} />
          <TextField {...f("price")} {...decimal} label={o.price} />
          <TextField {...f("vendor")} label={o.vendor} />
          <TextField {...f("url")} type="url" dir="ltr" label={o.url} hint={o.urlHint} />
          <TextField {...f("orderDate")} type="date" label={o.orderDate} required requiredLabel={req} />
          <TextField {...f("expectedDelivery")} type="date" label={o.expectedDelivery} />
          {withStatus && <SelectField {...f("status")} label={o.status} options={ORDER_STATUSES.map((x) => ({ value: x, label: o.statuses[x] }))} />}
        </div>
        <TextareaField {...f("notes")} label={t.ui.notes} />
      </div>
      <SubmitButton pendingLabel={t.common.saving}>{submitLabel}</SubmitButton>
    </form>
  );
}

/** Both roles. The add-to-stock checkbox only appears when the order is linked to an item with a quantity. */
export function OrderStatusForm({ t, action, hidden, status, stockLabel }: { t: Dict; action: Action; hidden: Record<string, string>; status: string; stockLabel?: string }) {
  const { state, formAction, ref } = useForm(action);
  const o = t.orders;
  return (
    <form ref={ref} action={formAction}>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <SelectField id="order-status" name="status" label={o.status} defaultValue={status} options={ORDER_STATUSES.map((x) => ({ value: x, label: o.statuses[x] }))} />
      {stockLabel && <CheckboxField name="addToStock" label={stockLabel} defaultChecked hint={o.stockNote} />}
      <SubmitButton variant="secondary" pendingLabel={t.common.saving}>{o.saveStatus}</SubmitButton>
    </form>
  );
}

// ─────────── Routines ───────────
export function RoutineForm({ t, action, hidden, initial, members, submitLabel, today }: {
  t: Dict; action: Action; hidden: Record<string, string>; initial?: Record<string, unknown>; members: Member[]; submitLabel: string; today: string;
}) {
  const form = useForm(action, initial ?? { scheduleType: "daily", startDate: today, times: ["08:00"] });
  const { state, formAction, ref, f } = form;
  const r = t.routines, req = t.common.required;
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={hidden} />
      <p className="mb-4 text-sm text-muted">{t.common.requiredLegend}</p>
      <div className={card}>
        <TextField {...f("name")} label={r.name} required requiredLabel={req} />
        <TextareaField {...f("description")} label={r.description} />
        <SelectField {...f("responsibleUserId")} label={r.responsible} options={memberOptions(t, members)} />
      </div>
      <ScheduleFields t={t} form={form} labels={{ legend: r.schedule, times: r.times, timesHint: r.timesHint, time: r.time }} />
      <SubmitButton pendingLabel={t.common.saving}>{submitLabel}</SubmitButton>
    </form>
  );
}

/** Both roles: log an activity that wasn't on the schedule. */
export function ExtraActivityForm({ t, action, hidden }: { t: Dict; action: Action; hidden: Record<string, string> }) {
  const { state, formAction, ref, e } = useForm(action);
  useResetOnSuccess(state, ref);
  return (
    <form ref={ref} action={formAction} noValidate>
      <FormStatus state={state} formRef={ref} />
      <Hidden fields={{ ...hidden, status: "completed" }} />
      <TextField name="notes" label={t.ui.notes} hint={t.routines.logExtraHint} error={e.notes} />
      <SubmitButton variant="secondary" pendingLabel={t.common.saving}>{t.routines.logExtraButton}</SubmitButton>
    </form>
  );
}
