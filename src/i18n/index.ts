import type { Locale } from "@/server/db/schema";
import { en, type Dict } from "./en";
import { he } from "./he";

export type { Dict };
export const dictionaries: Record<Locale, Dict> = { he, en };
export const dirOf = (l: Locale) => (l === "he" ? "rtl" : "ltr");
export const LOCALE_COOKIE = "pch_locale";

/** Replace {name} placeholders. */
export const fmt = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

// Israeli defaults (PRD §16.3); dates shown in Asia/Jerusalem.
const intlLocale = (l: Locale) => (l === "he" ? "he-IL" : "en-IL");
export const formatDate = (l: Locale, d: Date | string) =>
  new Intl.DateTimeFormat(intlLocale(l), {
    dateStyle: "medium",
    timeZone: typeof d === "string" ? "UTC" : "Asia/Jerusalem", // ISO date-only strings carry no zone
  }).format(typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d);
export const formatNumber = (l: Locale, n: number) => new Intl.NumberFormat(intlLocale(l)).format(n);
