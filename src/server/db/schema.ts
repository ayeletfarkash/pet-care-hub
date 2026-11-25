import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const LOCALES = ["he", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(), // stored lower-cased + trimmed
  name: text("name").notNull(),
  passwordHash: text("password_hash"), // null for Google-only accounts
  googleSub: text("google_sub").unique(), // Google account id (OpenID `sub`)
  locale: text("locale", { enum: LOCALES }).notNull().default("he"),
  createdAt: createdAt(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }), // account deletion (PRD §4.8), not used in Phase 1
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
);

export const accessibilityPreferences = sqliteTable("accessibility_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  textScale: integer("text_scale").notNull().default(100), // percent
  contrast: text("contrast", { enum: ["default", "high"] }).notNull().default("default"),
  underlineLinks: integer("underline_links", { mode: "boolean" }).notNull().default(false),
  highlightFocus: integer("highlight_focus", { mode: "boolean" }).notNull().default(false),
  reduceMotion: integer("reduce_motion", { mode: "boolean" }).notNull().default(false),
});

export const groups = sqliteTable("groups", {
  id: id(),
  createdAt: createdAt(),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  deletedById: text("deleted_by_id").references(() => users.id, { onDelete: "set null" }),
});

export const SPECIES = ["dog", "cat", "bird", "rabbit", "reptile", "fish", "rodent", "horse", "other"] as const;
export type Species = (typeof SPECIES)[number];
export const SEXES = ["male", "female", "unknown"] as const;

// PetDetails (vet + insurance, PRD §5.3) merged into pets: strictly 1:1 and always read together.
export const pets = sqliteTable("pets", {
  id: id(),
  groupId: text("group_id").notNull().unique().references(() => groups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  photoFile: text("photo_file"), // generated filename under data/uploads, never user-supplied
  species: text("species", { enum: SPECIES }).notNull(),
  speciesOther: text("species_other"),
  breed: text("breed"),
  sex: text("sex", { enum: SEXES }).notNull().default("unknown"),
  birthDate: text("birth_date"), // ISO yyyy-mm-dd; date-only, no time zone
  estimatedAgeYears: real("estimated_age_years"),
  weightKg: real("weight_kg"),
  color: text("color"),
  identifyingMarks: text("identifying_marks"),
  vetName: text("vet_name"),
  vetClinic: text("vet_clinic"),
  vetPhone: text("vet_phone"),
  vetAddress: text("vet_address"),
  insuranceProvider: text("insurance_provider"),
  insurancePolicyNumber: text("insurance_policy_number"),
  insuranceExpiry: text("insurance_expiry"),
  insuranceContact: text("insurance_contact"),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: id(),
    groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().$default(() => "admin"), // unused since roles were removed; kept so no data is lost
    joinedAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_group_user_uq").on(t.groupId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: id(),
    groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    tokenEnc: text("token_enc"), // AES-GCM encrypted token, so active links can be shared again; null for older rows
    role: text("role").notNull().default("caregiver"), // unused, see memberships.role
    email: text("email"), // set for email invitations; only that address may accept
    reusable: integer("reusable", { mode: "boolean" }).notNull().default(false),
    useCount: integer("use_count").notNull().default(0),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_group_idx").on(t.groupId)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    groupId: text("group_id").references(() => groups.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetUserId: text("target_user_id").references(() => users.id, { onDelete: "set null" }),
    meta: text("meta"), // JSON; never contains tokens or secrets
    createdAt: createdAt(),
  },
  (t) => [index("audit_group_idx").on(t.groupId)],
);

// ───────────────────────────── Phase 2 ─────────────────────────────
// Every table carries group_id. Child rows are always read/written with a group_id filter so an
// id from another group can never be used (FKs alone don't enforce that). Wall-clock times are
// local Israel strings ("YYYY-MM-DD" / "YYYY-MM-DDTHH:mm"), see src/server/schedule.ts.
const groupRef = () => text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" });
const userRef = (name: string) => text(name).references(() => users.id, { onDelete: "set null" }); // null = former member
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" });

export const MEDICAL_TYPES = ["vaccination", "deworming", "examination", "treatment", "medication", "surgery", "diagnosis", "lab_test", "other"] as const;
export type MedicalType = (typeof MEDICAL_TYPES)[number];

export const medicalRecords = sqliteTable(
  "medical_records",
  {
    id: id(),
    groupId: groupRef(),
    type: text("type", { enum: MEDICAL_TYPES }).notNull(),
    date: text("date").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    provider: text("provider"),
    details: text("details"), // event-specific free text (dosage given, lab results), entered by users, never generated
    notes: text("notes"),
    createdById: userRef("created_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("medical_group_date_idx").on(t.groupId, t.date)],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: id(),
    groupId: groupRef(),
    medicalRecordId: text("medical_record_id").notNull().references(() => medicalRecords.id, { onDelete: "cascade" }),
    file: text("file").notNull(), // generated name under UPLOAD_DIR
    mime: text("mime").notNull(),
    displayName: text("display_name").notNull(), // sanitized original name, display only
    size: integer("size").notNull(),
    uploadedById: userRef("uploaded_by_id"),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_record_idx").on(t.medicalRecordId)],
);

export const SCHEDULE_TYPES = ["daily", "weekdays", "interval"] as const;

export const medicationPlans = sqliteTable(
  "medication_plans",
  {
    id: id(),
    groupId: groupRef(),
    name: text("name").notNull(),
    dosage: text("dosage").notNull(), // as prescribed, user-entered (PRD §6.6)
    instructions: text("instructions"),
    scheduleType: text("schedule_type", { enum: SCHEDULE_TYPES }).notNull(),
    times: text("times", { mode: "json" }).$type<string[]>().notNull(),
    weekdays: text("weekdays", { mode: "json" }).$type<number[]>().notNull(),
    intervalDays: integer("interval_days"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    responsibleUserId: userRef("responsible_user_id"),
    notes: text("notes"),
    createdById: userRef("created_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("med_plans_group_idx").on(t.groupId)],
);

export const medicationAdministrations = sqliteTable(
  "medication_administrations",
  {
    id: id(),
    groupId: groupRef(),
    planId: text("plan_id").notNull().references(() => medicationPlans.id, { onDelete: "cascade" }),
    scheduledFor: text("scheduled_for").notNull(), // the computed dose this confirms
    administeredAt: text("administered_at").notNull(), // actual local time
    administeredById: userRef("administered_by_id"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("med_admin_plan_dose_uq").on(t.planId, t.scheduledFor), index("med_admin_group_idx").on(t.groupId)],
);

export const EVENT_TYPES = ["vet", "grooming", "boarding", "sitter", "treatment", "lab_test", "birthday", "personal", "other"] as const;
export const RECURRENCES = ["none", "daily", "weekly", "monthly", "yearly"] as const;

export const events = sqliteTable(
  "events",
  {
    id: id(),
    groupId: groupRef(),
    type: text("type", { enum: EVENT_TYPES }).notNull(),
    title: text("title").notNull(),
    startsAt: text("starts_at").notNull(),
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    location: text("location"),
    provider: text("provider"),
    description: text("description"),
    notes: text("notes"),
    assigneeId: userRef("assignee_id"),
    recurrence: text("recurrence", { enum: RECURRENCES }).notNull().default("none"),
    recurrenceUntil: text("recurrence_until"),
    autoPrep: integer("auto_prep", { mode: "boolean" }).notNull().default(false), // Phase 4: prep task the day before
    autoFollowup: integer("auto_followup", { mode: "boolean" }).notNull().default(false), // Phase 4: follow-up task after
    createdById: userRef("created_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("events_group_start_idx").on(t.groupId, t.startsAt)],
);

export const eventOccurrenceStatus = sqliteTable(
  "event_occurrence_status",
  {
    id: id(),
    groupId: groupRef(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    occurrence: text("occurrence").notNull(),
    status: text("status", { enum: ["completed", "cancelled"] }).notNull(),
    byUserId: userRef("by_user_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("event_occ_uq").on(t.eventId, t.occurrence)],
);

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const TASK_STATUSES = ["new", "in_progress", "completed", "cancelled"] as const;
export const TASK_RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    groupId: groupRef(),
    seriesId: text("series_id").notNull(), // server-generated; shared by all instances of a recurring task
    title: text("title").notNull(),
    description: text("description"),
    dueAt: text("due_at"), // required when recurring
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("normal"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("new"), // "overdue" is computed
    recurrence: text("recurrence", { enum: TASK_RECURRENCES }).notNull().default("none"),
    recurrenceInterval: integer("recurrence_interval").notNull().default(1), // every N days/weeks/months
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    completedById: userRef("completed_by_id"),
    createdById: userRef("created_by_id"),
    // Phase 4 automatic tasks (PRD §10.6): what generated it; source_key makes generation idempotent.
    sourceType: text("source_type", { enum: ["inventory", "event"] }),
    sourceId: text("source_id"),
    sourceKey: text("source_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tasks_series_due_uq").on(t.seriesId, t.dueAt), // next recurring instance is created at most once
    uniqueIndex("tasks_source_key_uq").on(t.groupId, t.sourceKey).where(sql`source_key IS NOT NULL`), // each automatic task once
    index("tasks_group_status_due_idx").on(t.groupId, t.status, t.dueAt),
  ],
);

/** Keys of automatic tasks a member deleted, so the generator does not create them again. */
export const dismissedAutoTasks = sqliteTable(
  "dismissed_auto_tasks",
  { groupId: groupRef(), sourceKey: text("source_key").notNull() },
  (t) => [primaryKey({ columns: [t.groupId, t.sourceKey] })],
);

export const taskAssignees = sqliteTable(
  "task_assignees",
  {
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    groupId: groupRef(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("task_assignees_user_idx").on(t.userId)],
);

export const taskComments = sqliteTable("task_comments", {
  id: id(),
  groupId: groupRef(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: userRef("user_id"),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const taskHistory = sqliteTable("task_history", {
  id: id(),
  groupId: groupRef(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  actorId: userRef("actor_id"),
  action: text("action").notNull(),
  meta: text("meta"),
  createdAt: createdAt(),
});

export const taskTransferRequests = sqliteTable(
  "task_transfer_requests",
  {
    id: id(),
    groupId: groupRef(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    fromUserId: userRef("from_user_id"),
    toUserId: text("to_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    requestedById: userRef("requested_by_id"),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    decidedById: userRef("decided_by_id"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  // One open request per task (partial unique index).
  (t) => [uniqueIndex("task_transfer_pending_uq").on(t.taskId).where(sql`status = 'pending'`)],
);

// ───────────────────────────── Phase 3 ─────────────────────────────
// The group's pet is implicit (pets.group_id is UNIQUE), so no pet_id columns.
export const INVENTORY_TYPES = ["food", "medication", "treats", "supplies", "other"] as const;
export const MOVEMENT_KINDS = ["purchase", "consumption", "adjustment", "depleted"] as const;

export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: id(),
    groupId: groupRef(),
    name: text("name").notNull(),
    brand: text("brand"),
    type: text("type", { enum: INVENTORY_TYPES }).notNull(),
    unit: text("unit"), // free text: "kg", "cans", "tablets"
    quantity: real("quantity").notNull().default(0), // depleted = 0
    packageSize: real("package_size"),
    dailyUsage: real("daily_usage"), // estimated consumption per day (PRD §8.4)
    lowStockThreshold: real("low_stock_threshold"),
    vendor: text("vendor"),
    price: real("price"),
    purchaseDate: text("purchase_date"),
    medicationPlanId: text("medication_plan_id").references(() => medicationPlans.id, { onDelete: "set null" }), // PRD §6.5
    notes: text("notes"),
    createdById: userRef("created_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("inventory_group_idx").on(t.groupId)],
);

export const ORDER_STATUSES = ["ordered", "processing", "shipped", "delivered", "cancelled"] as const;

export const orders = sqliteTable(
  "orders",
  {
    id: id(),
    groupId: groupRef(),
    product: text("product").notNull(),
    itemId: text("item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
    vendor: text("vendor"),
    url: text("url"), // http(s) only, validated
    orderDate: text("order_date").notNull(),
    expectedDelivery: text("expected_delivery"),
    price: real("price"),
    quantity: real("quantity"), // in the linked item's unit
    status: text("status", { enum: ORDER_STATUSES }).notNull().default("ordered"),
    deliveredAt: text("delivered_at"),
    notes: text("notes"),
    createdById: userRef("created_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("orders_group_date_idx").on(t.groupId, t.orderDate)],
);

export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    id: id(),
    groupId: groupRef(),
    itemId: text("item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: MOVEMENT_KINDS }).notNull(),
    delta: real("delta").notNull(),
    quantityAfter: real("quantity_after").notNull(),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    byUserId: userRef("by_user_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  // A delivered order adds stock at most once.
  (t) => [index("movements_item_idx").on(t.itemId), uniqueIndex("movements_order_uq").on(t.orderId).where(sql`order_id IS NOT NULL`)],
);

export const routines = sqliteTable(
  "routines",
  {
    id: id(),
    groupId: groupRef(),
    name: text("name").notNull(),
    description: text("description"),
    scheduleType: text("schedule_type", { enum: SCHEDULE_TYPES }).notNull(), // same rules as medication plans
    times: text("times", { mode: "json" }).$type<string[]>().notNull(),
    weekdays: text("weekdays", { mode: "json" }).$type<number[]>().notNull(),
    intervalDays: integer("interval_days"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    responsibleUserId: userRef("responsible_user_id"),
    createdById: userRef("created_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("routines_group_idx").on(t.groupId)],
);

export const routineLogs = sqliteTable(
  "routine_logs",
  {
    id: id(),
    groupId: groupRef(),
    routineId: text("routine_id").notNull().references(() => routines.id, { onDelete: "cascade" }),
    scheduledFor: text("scheduled_for"), // null = extra, unscheduled activity (always "completed")
    status: text("status", { enum: ["completed", "missed"] }).notNull(),
    at: text("at").notNull(), // local time it was logged
    byUserId: userRef("by_user_id"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("routine_logs_occ_uq").on(t.routineId, t.scheduledFor), index("routine_logs_group_idx").on(t.groupId)],
);

// ───────────────────────────── Phase 4 ─────────────────────────────
// Reminders are derived from computed doses/occurrences/tasks/activities by a periodic sweep
// (src/server/services/reminders.ts); only the notification each recipient received is stored.
export const NOTIFICATION_CATEGORIES = ["medications", "events", "tasks", "inventory", "routines"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const REMINDER_SOURCES = ["medication", "event", "task", "routine"] as const;
export type ReminderSource = (typeof REMINDER_SOURCES)[number];
export const NOTIFICATION_SOURCES = [...REMINDER_SOURCES, "inventory"] as const;
export const RECIPIENT_MODES = ["responsible", "all", "selected"] as const;

/** Only disabled categories are stored; a missing row means enabled (PRD §12.1). */
export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    category: text("category", { enum: NOTIFICATION_CATEGORIES }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] })],
);

/** Who is reminded about a source, and how early. No row = defaults (responsible person, default lead). */
export const reminderRules = sqliteTable(
  "reminder_rules",
  {
    id: id(),
    groupId: groupRef(),
    sourceType: text("source_type", { enum: REMINDER_SOURCES }).notNull(),
    sourceId: text("source_id").notNull(), // polymorphic; the sweep ignores rules whose source is gone
    leadMinutes: integer("lead_minutes").notNull(),
    remindAt: text("remind_at"), // tasks only: custom local date-time; overrides leadMinutes when set
    recipientMode: text("recipient_mode", { enum: RECIPIENT_MODES }).notNull(),
    updatedById: userRef("updated_by_id"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("reminder_rules_source_uq").on(t.sourceType, t.sourceId), index("reminder_rules_group_idx").on(t.groupId)],
);

export const reminderRuleRecipients = sqliteTable(
  "reminder_rule_recipients",
  {
    ruleId: text("rule_id").notNull().references(() => reminderRules.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    groupId: groupRef(),
  },
  (t) => [primaryKey({ columns: [t.ruleId, t.userId] })],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    groupId: groupRef(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    category: text("category", { enum: NOTIFICATION_CATEGORIES }).notNull(),
    sourceType: text("source_type", { enum: NOTIFICATION_SOURCES }).notNull(),
    sourceId: text("source_id").notNull(),
    occurrenceKey: text("occurrence_key").notNull(), // dose/occurrence/due time, or a restock cycle
    kind: text("kind", { enum: ["reminder", "snooze"] }).notNull().default("reminder"),
    deliverAt: text("deliver_at").notNull(), // local Israel time; hidden until then
    params: text("params", { mode: "json" }).$type<{ name: string; pet: string; at?: string }>().notNull(), // rendered in the reader's language
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    pushedAt: integer("pushed_at", { mode: "timestamp_ms" }), // push attempted (at most once)
    createdAt: createdAt(),
  },
  (t) => [
    // Each recipient gets one notification per occurrence, however often the sweep runs.
    uniqueIndex("notifications_once_uq").on(t.userId, t.sourceType, t.sourceId, t.kind, t.occurrenceKey),
    index("notifications_user_deliver_idx").on(t.userId, t.deliverAt),
  ],
);

/** One Web Push subscription per browser/device (PRD §12.3). Endpoints are limited to known push services. */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);
