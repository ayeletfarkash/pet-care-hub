import { z } from "zod";
import {
  EVENT_TYPES, INVENTORY_TYPES, LOCALES, NOTIFICATION_CATEGORIES, RECIPIENT_MODES, MEDICAL_TYPES, MOVEMENT_KINDS, ORDER_STATUSES, RECURRENCES, ROLES, SCHEDULE_TYPES, SEXES, SPECIES, TASK_PRIORITIES, TASK_RECURRENCES,
} from "./db/schema";
import { addDays, addMinutesLocal, isValidTime, nowLocal, todayLocal } from "./schedule";

// Issue messages are i18n keys under `validation.*`.
const req = (max = 120) => z.string().trim().min(1, "required").max(max, "too_long");
// Optional text: empty string -> null.
const opt = (max = 200) =>
  z.string().trim().max(max, "too_long").transform((v) => (v === "" ? null : v)).nullable().optional();
const isoDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "invalid_date");
const optNumber = (max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .nullable()
    .optional()
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0 && v <= max), "invalid_number");

export const email = z.string().trim().toLowerCase().min(1, "required").max(254, "too_long").email("email");

export const registerSchema = z.object({
  name: req(),
  email,
  password: z.string().min(8, "password_min").max(200, "too_long"),
  locale: z.enum(LOCALES).catch("he"),
});

export const loginSchema = z.object({ email, password: z.string().min(1, "required").max(200, "too_long") });

export const profileSchema = z.object({ name: req(), locale: z.enum(LOCALES) });

export const petSchema = z
  .object({
    name: req(80),
    species: z.enum(SPECIES, { message: "required" }),
    speciesOther: opt(80),
    breed: opt(80),
    sex: z.enum(SEXES).catch("unknown"),
    birthDate: isoDate.refine((v) => v == null || v <= new Date().toISOString().slice(0, 10), "future_date"),
    estimatedAgeYears: optNumber(100),
    weightKg: optNumber(2000),
    color: opt(80),
    identifyingMarks: opt(500),
    vetName: opt(),
    vetClinic: opt(),
    vetPhone: opt(40),
    vetAddress: opt(300),
    insuranceProvider: opt(),
    insurancePolicyNumber: opt(80),
    insuranceExpiry: isoDate,
    insuranceContact: opt(300),
  })
  .superRefine((v, ctx) => {
    if (v.species === "other" && !v.speciesOther)
      ctx.addIssue({ code: "custom", path: ["speciesOther"], message: "required" });
  });
export type PetInput = z.infer<typeof petSchema>;

export const invitationSchema = z.object({
  role: z.enum(ROLES).catch("caregiver"),
  email: z.string().trim().toLowerCase().max(254, "too_long").transform((v) => (v === "" ? null : v))
    .refine((v) => v == null || z.email().safeParse(v).success, "email").nullable().optional(),
  reusable: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  expiresInDays: z.coerce.number().int().min(1, "invalid_number").max(30, "invalid_number").catch(7),
});
export type InvitationInput = z.infer<typeof invitationSchema>;

export const roleSchema = z.enum(ROLES);

// ───────────── Phase 2 ─────────────
const localDateTime = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, "invalid_date")
  .refine((v) => !Number.isNaN(Date.parse(`${v}:00Z`)), "invalid_date");
const reqDate = z.string().trim().min(1, "required").refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "invalid_date");
const optUserId = z.string().trim().transform((v) => (v === "" ? null : v)).nullable().optional();

export const medicalRecordSchema = z.object({
  type: z.enum(MEDICAL_TYPES, { message: "required" }),
  date: reqDate.refine((v) => v <= todayLocal(), "future_date"),
  title: req(120),
  description: opt(2000),
  provider: opt(),
  details: opt(2000),
  notes: opt(2000),
});
export type MedicalRecordInput = z.infer<typeof medicalRecordSchema>;

/** Schedule fields shared by medication plans and routines (daily / weekdays / every N days, 1–6 times). */
const scheduleShape = {
  scheduleType: z.enum(SCHEDULE_TYPES, { message: "required" }),
  times: z.array(z.string()).default([])
    .transform((a) => [...new Set(a.map((s) => s.trim()).filter(Boolean))].sort())
    .refine((a) => a.length >= 1 && a.length <= 6, "times_required")
    .refine((a) => a.every(isValidTime), "invalid_time"),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]).transform((a) => [...new Set(a)].sort()),
  intervalDays: optNumber(365).transform((v) => (v == null ? null : Math.trunc(v))),
  startDate: reqDate,
  endDate: isoDate,
  responsibleUserId: optUserId,
};
type ScheduleIn = { scheduleType: (typeof SCHEDULE_TYPES)[number]; weekdays: number[]; intervalDays: number | null; startDate: string; endDate?: string | null };
const checkSchedule = (v: ScheduleIn, ctx: z.RefinementCtx) => {
  if (v.scheduleType === "weekdays" && v.weekdays.length === 0) ctx.addIssue({ code: "custom", path: ["weekdays"], message: "weekdays_required" });
  if (v.scheduleType === "interval" && (!v.intervalDays || v.intervalDays < 1)) ctx.addIssue({ code: "custom", path: ["intervalDays"], message: "invalid_number" });
  if (v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "end_before_start" });
};
const normalizeSchedule = <V extends ScheduleIn>(v: V) => ({
  ...v,
  weekdays: v.scheduleType === "weekdays" ? v.weekdays : [],
  intervalDays: v.scheduleType === "interval" ? v.intervalDays : null,
});

export const medicationPlanSchema = z.object({ name: req(120), dosage: req(200), instructions: opt(1000), notes: opt(1000), ...scheduleShape })
  .superRefine(checkSchedule).transform(normalizeSchedule);
export type MedicationPlanInput = z.infer<typeof medicationPlanSchema>;

export const administrationSchema = z.object({
  planId: z.string().min(1),
  scheduledFor: localDateTime,
  notes: opt(500),
});

export const eventSchema = z
  .object({
    type: z.enum(EVENT_TYPES, { message: "required" }),
    title: req(120),
    date: reqDate,
    time: z.string().trim().transform((v) => (v === "" ? null : v)).nullable().optional()
      .refine((v) => v == null || isValidTime(v), "invalid_time"),
    location: opt(300),
    provider: opt(),
    description: opt(2000),
    notes: opt(2000),
    assigneeId: optUserId,
    recurrence: z.enum(RECURRENCES).catch("none"),
    recurrenceUntil: isoDate,
    autoPrep: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    autoFollowup: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  })
  .superRefine((v, ctx) => {
    if (v.recurrenceUntil && v.recurrenceUntil < v.date) ctx.addIssue({ code: "custom", path: ["recurrenceUntil"], message: "end_before_start" });
  })
  .transform(({ date, time, ...v }) => ({
    ...v,
    allDay: !time,
    startsAt: `${date}T${time ?? "00:00"}`,
    recurrenceUntil: v.recurrence === "none" ? null : v.recurrenceUntil ?? null,
  }));
export type EventInput = z.infer<typeof eventSchema>;

export const taskSchema = z
  .object({
    title: req(160),
    description: opt(2000),
    dueDate: isoDate,
    dueTime: z.string().trim().transform((v) => (v === "" ? null : v)).nullable().optional()
      .refine((v) => v == null || isValidTime(v), "invalid_time"),
    priority: z.enum(TASK_PRIORITIES).catch("normal"),
    recurrence: z.enum(TASK_RECURRENCES).catch("none"),
    recurrenceInterval: z.string().trim().optional().transform((v) => (v ? Number(v) : 1))
      .refine((v) => Number.isInteger(v) && v >= 1 && v <= 365, "invalid_number"),
    assignees: z.array(z.string().min(1)).max(50).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.recurrence !== "none" && !v.dueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "due_required" });
  })
  .transform(({ dueDate, dueTime, ...v }) => ({
    ...v,
    recurrenceInterval: v.recurrence === "none" ? 1 : v.recurrenceInterval,
    assignees: [...new Set(v.assignees)],
    dueAt: dueDate ? `${dueDate}T${dueTime ?? "23:59"}` : null,
  }));
export type TaskInput = z.infer<typeof taskSchema>;

export const commentSchema = z.object({ body: req(2000) });

// ───────────── Phase 3 ─────────────
// Quantities are rounded to 3 decimals so REAL drift (0.1 + 0.2) never reaches thresholds.
export const roundQty = (n: number) => Math.round(n * 1000) / 1000;
export const MAX_QTY = 1_000_000;
const qty = (max = 1_000_000) => optNumber(max).transform((v) => (v == null ? null : roundQty(v)));
const optId = optUserId;
/** External links are rendered as hrefs: only absolute http(s) URLs, never javascript:/data:. */
const httpUrl = z.string().trim().max(500, "too_long").transform((v) => (v === "" ? null : v)).nullable().optional()
  .refine((v) => {
    if (v == null) return true;
    try { const u = new URL(v); return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password; } catch { return false; }
  }, "invalid_url");

export const inventoryItemSchema = z.object({
  name: req(120),
  brand: opt(),
  type: z.enum(INVENTORY_TYPES, { message: "required" }),
  unit: opt(30),
  quantity: qty().transform((v) => v ?? 0),
  packageSize: qty(),
  dailyUsage: qty(),
  lowStockThreshold: qty(),
  vendor: opt(),
  price: optNumber(1_000_000),
  purchaseDate: isoDate.refine((v) => v == null || v <= todayLocal(), "future_date"),
  medicationPlanId: optId,
  notes: opt(1000),
});
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

/** Both roles: consumption/purchase take an amount, adjustment takes the counted quantity, depleted none. */
export const stockChangeSchema = z
  .object({ kind: z.enum(MOVEMENT_KINDS), amount: qty(), note: opt(300) })
  .superRefine((v, ctx) => {
    if (v.kind !== "depleted" && v.amount == null) ctx.addIssue({ code: "custom", path: ["amount"], message: "required" });
    if ((v.kind === "purchase" || v.kind === "consumption") && v.amount === 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "invalid_number" });
  });
export type StockChangeInput = z.infer<typeof stockChangeSchema>;

const orderFields = {
  product: req(160),
  itemId: optId,
  vendor: opt(),
  url: httpUrl,
  orderDate: reqDate,
  expectedDelivery: isoDate,
  price: optNumber(1_000_000),
  quantity: qty(),
  notes: opt(1000),
};
const deliveryAfterOrder = (v: { orderDate: string; expectedDelivery?: string | null }, ctx: z.RefinementCtx) => {
  if (v.expectedDelivery && v.expectedDelivery < v.orderDate) ctx.addIssue({ code: "custom", path: ["expectedDelivery"], message: "end_before_start" });
};
export const orderSchema = z.object(orderFields).superRefine(deliveryAfterOrder);
export type OrderInput = z.infer<typeof orderSchema>;
export const newOrderSchema = z.object({ ...orderFields, status: z.enum(ORDER_STATUSES).catch("ordered") }).superRefine(deliveryAfterOrder);
export const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES, { message: "required" }),
  addToStock: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export const routineSchema = z.object({ name: req(120), description: opt(1000), ...scheduleShape }).superRefine(checkSchedule).transform(normalizeSchedule);
export type RoutineInput = z.infer<typeof routineSchema>;

export const routineLogSchema = z.object({
  routineId: z.string().min(1),
  scheduledFor: z.string().trim().transform((v) => (v === "" ? null : v)).nullable().optional()
    .refine((v) => v == null || localDateTime.safeParse(v).success, "invalid_date"),
  status: z.enum(["completed", "missed"]).catch("completed"),
  notes: opt(500),
});

// ───────── Phase 4 ─────────
export const REMINDER_LEADS = [0, 15, 60, 1440] as const; // minutes before: at the time, 15 min, 1 h, 1 day

/** Unchecked categories are absent from the form, so the list holds the enabled ones. */
export const notificationPrefsSchema = z.object({ categories: z.array(z.enum(NOTIFICATION_CATEGORIES)).default([]) });

export const reminderRuleSchema = z.object({
  leadMinutes: z.coerce.number().refine((n) => (REMINDER_LEADS as readonly number[]).includes(n), "required"),
  recipientMode: z.enum(RECIPIENT_MODES),
  recipients: z.array(z.string().trim().min(1)).max(100).default([]),
}).refine((v) => v.recipientMode !== "selected" || v.recipients.length > 0, { message: "recipients_required", path: ["recipients"] })
  .transform((v) => ({ ...v, recipients: v.recipientMode === "selected" ? [...new Set(v.recipients)] : [] }));
export type ReminderRuleInput = z.infer<typeof reminderRuleSchema>;

export const SNOOZE_MAX_DAYS = 30;
/** Snooze (PRD §12.4): 15 min, 1 h, tomorrow 08:00, or a custom local time. Resolves to the new delivery time. */
export const snoozeSchema = z.object({
  option: z.enum(["15", "60", "tomorrow", "custom"]),
  customAt: z.string().trim().optional(),
}).superRefine((v, ctx) => {
  if (v.option === "custom" && !localDateTime.safeParse(v.customAt ?? "").success) ctx.addIssue({ code: "custom", path: ["customAt"], message: "invalid_date" });
}).transform((v) => {
  const now = nowLocal();
  if (v.option === "tomorrow") return { until: `${addDays(now.slice(0, 10), 1)}T08:00` };
  if (v.option === "custom") return { until: v.customAt! };
  return { until: addMinutesLocal(now, Number(v.option)) };
});

// Only real browser push services, so a crafted endpoint can't make the server send requests elsewhere (SSRF).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
const b64url = (max: number) => z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).max(max);
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine((v) => {
    try { const u = new URL(v); return u.protocol === "https:" && !u.port && !u.username && !u.password && PUSH_HOSTS.some((h) => h.test(u.hostname)); } catch { return false; }
  }),
  keys: z.object({ p256dh: b64url(200), auth: b64url(100) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

// ───────── Search (PRD §14) ─────────
export const SEARCH_TYPES = ["pets", "tasks", "events", "medical", "medications", "products", "orders"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
const optDate = z.string().trim().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined));
/** GET parameters: anything malformed is dropped rather than failing the page. */
export const searchSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  type: z.enum(SEARCH_TYPES).optional().catch(undefined),
  group: z.string().trim().max(64).optional().catch(undefined),
  status: z.enum(["open", "closed"]).optional().catch(undefined),
  assignee: z.string().trim().max(64).optional().catch(undefined),
  from: optDate.catch(undefined),
  to: optDate.catch(undefined),
});
export type SearchInput = z.infer<typeof searchSchema>;
export const SEARCH_MIN_CHARS = 2;
