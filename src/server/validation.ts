import { z } from "zod";
import { LOCALES, ROLES, SEXES, SPECIES } from "./db/schema";

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
