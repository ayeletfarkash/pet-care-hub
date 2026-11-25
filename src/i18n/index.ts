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

// Wall-clock values ("YYYY-MM-DDTHH:mm", Israel local) are formatted as-is: treat them as UTC
// and format in UTC so no time-zone shift is applied.
const wall = (s: string) => new Date(`${s.length === 10 ? `${s}T00:00` : s}:00Z`);
export const formatLocalDateTime = (l: Locale, s: string) =>
  new Intl.DateTimeFormat(intlLocale(l), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(wall(s));
export const formatLocalTime = (l: Locale, s: string) =>
  new Intl.DateTimeFormat(intlLocale(l), { timeStyle: "short", timeZone: "UTC" }).format(wall(s));
export const formatDayHeading = (l: Locale, d: string) =>
  new Intl.DateTimeFormat(intlLocale(l), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(wall(d));
export const formatWeekday = (l: Locale, d: string, style: "long" | "short" | "narrow") =>
  new Intl.DateTimeFormat(intlLocale(l), { weekday: style, timeZone: "UTC" }).format(wall(d));
export const formatMonth = (l: Locale, ym: string) =>
  new Intl.DateTimeFormat(intlLocale(l), { month: "long", year: "numeric", timeZone: "UTC" }).format(wall(`${ym}-01`));
/** List formatting ("08:00, 14:00 and 20:00" / "08:00, 14:00 ו-20:00"). */
export const formatList = (l: Locale, items: string[]) => new Intl.ListFormat(intlLocale(l), { style: "long", type: "conjunction" }).format(items);
/** A real instant (e.g. created_at), shown in Israel time. */
export const formatDateTime = (l: Locale, d: Date) =>
  new Intl.DateTimeFormat(intlLocale(l), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(d);
