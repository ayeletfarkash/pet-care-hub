import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const LOCALES = ["he", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const ROLES = ["admin", "caregiver"] as const;
export type Role = (typeof ROLES)[number];

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(), // stored lower-cased + trimmed
  name: text("name").notNull(),
  passwordHash: text("password_hash"), // null for future OAuth-only accounts
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
    role: text("role", { enum: ROLES }).notNull(),
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
    role: text("role", { enum: ROLES }).notNull().default("caregiver"),
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
